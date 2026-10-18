import { TransactionalConnection } from '@vendure/core';
import gql from 'graphql-tag';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MercadoPagoConnection } from '../src';
import { MercadoPagoMock } from './mp-mock';
import {
  asStoreAdmin,
  asSuperAdmin,
  createMpTestEnvironment,
  createStore,
  TestStore,
} from './test-env';

const START = gql`
  mutation {
    startMercadoPagoConnection
  }
`;
const CONNECTION = gql`
  query {
    mercadoPagoConnection {
      connected
      status
      mpUserId
      scope
      lastError
    }
  }
`;

const { server, adminClient, port, init } = createMpTestEnvironment(3101);
const mp = new MercadoPagoMock();

let storeA: TestStore;
let storeB: TestStore;
let noPermission: TestStore;

const grant = (userId: number, overrides: Record<string, unknown> = {}) => ({
  access_token: `APP_USR-access-${userId}-${Math.random().toString(36).slice(2)}`,
  refresh_token: `TG-refresh-${userId}-${Math.random().toString(36).slice(2)}`,
  user_id: userId,
  expires_in: 15552000,
  scope: 'offline_access read write',
  public_key: `APP_USR-public-${userId}`,
  ...overrides,
});

/** Starts the flow as the store's admin and returns the `state` carried by the authorization URL. */
async function startFlow(store: TestStore) {
  await asStoreAdmin(adminClient, store);
  const { startMercadoPagoConnection } = await adminClient.query<{
    startMercadoPagoConnection: string;
  }>(START);
  const url = new URL(startMercadoPagoConnection);
  return { url, state: url.searchParams.get('state')! };
}

async function callback(params: Record<string, string>) {
  const response = await fetch(
    `http://localhost:${port}/mercadopago/oauth/callback?${new URLSearchParams(params)}`,
    { redirect: 'manual' },
  );
  const location = new URL(response.headers.get('location')!);
  return { status: response.status, location, headers: response.headers };
}

const rows = () =>
  server.app.get(TransactionalConnection).rawConnection.getRepository(MercadoPagoConnection);

beforeAll(async () => {
  mp.start();
  await init();
  storeA = await createStore(adminClient, 'store-a');
  storeB = await createStore(adminClient, 'store-b');
  noPermission = await createStore(adminClient, 'store-c', { permissions: ['ReadOrder'] });
}, 120_000);

afterAll(async () => {
  mp.stop();
  await server.destroy();
});

beforeEach(() => mp.reset());

describe('Mercado Pago OAuth linking (PRD 9.2)', () => {
  it('builds an authorization URL with PKCE S256, an unguessable state and no secrets', async () => {
    const { url } = await startFlow(storeA);

    expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com/authorization');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('platform_id')).toBe('mp');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://platform.example.test/mercadopago/oauth/callback',
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.toString()).not.toContain('test-client-secret');
  });

  it('links the account, encrypts the tokens and never returns them', async () => {
    const { url, state } = await startFlow(storeA);
    const tokens = grant(111);
    mp.grants.set('code-a', tokens);

    const result = await callback({ code: 'code-a', state });

    expect(result.status).toBe(302);
    expect(result.location.origin + result.location.pathname).toBe(
      'https://platform.example.test/dashboard',
    );
    expect(result.location.searchParams.get('mp')).toBe('connected');
    expect(result.headers.get('referrer-policy')).toBe('no-referrer');

    // The exchange carried the PKCE verifier that matches the challenge, and the sandbox flag.
    const [exchange] = mp.requestsTo('POST', '/oauth/token');
    expect(exchange!.body).toMatchObject({
      grant_type: 'authorization_code',
      code: 'code-a',
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      redirect_uri: 'https://platform.example.test/mercadopago/oauth/callback',
      test_token: 'true',
    });
    const verifier = String(exchange!.body!.code_verifier);
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      url.searchParams.get('code_challenge'),
    );

    const row = (await rows().findOneBy({ channelId: storeA.channelId }))!;
    expect(row.mpUserId).toBe('111');
    expect(row.status).toBe('connected');
    expect(row.accessToken).not.toContain(tokens.access_token);
    expect(row.refreshToken).not.toContain(tokens.refresh_token);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 100 * 86_400_000);

    const { mercadoPagoConnection } = await adminClient.query(CONNECTION);
    expect(mercadoPagoConnection).toMatchObject({
      connected: true,
      status: 'connected',
      mpUserId: '111',
    });
    expect(JSON.stringify(mercadoPagoConnection)).not.toContain('APP_USR-access');
  });

  it('accepts a state only once', async () => {
    const { state } = await startFlow(storeA);
    mp.grants.set('code-a', grant(111));

    expect((await callback({ code: 'code-a', state })).location.searchParams.get('mp')).toBe(
      'connected',
    );
    const replay = await callback({ code: 'code-a', state });

    expect(replay.location.searchParams.get('mp')).toBe('error');
    expect(replay.location.searchParams.get('reason')).toBe('invalid_state');
    expect(mp.requestsTo('POST', '/oauth/token')).toHaveLength(1);
  });

  it('rejects an unknown or missing state without calling Mercado Pago', async () => {
    const unknown = await callback({ code: 'c', state: 'not-a-real-state' });
    const missing = await callback({ code: 'c' });

    expect(unknown.location.searchParams.get('reason')).toBe('invalid_state');
    expect(missing.location.searchParams.get('reason')).toBe('invalid_state');
    expect(mp.requests).toHaveLength(0);
  });

  it('reports a denied authorization and burns the state', async () => {
    const { state } = await startFlow(storeB);

    const denied = await callback({ error: 'access_denied', state });

    expect(denied.location.searchParams.get('reason')).toBe('access_denied');
    expect(mp.requests).toHaveLength(0);
    expect(await rows().findOneBy({ channelId: storeB.channelId })).toBeNull();
  });

  it('rejects an account that is already linked to another store without touching the existing link', async () => {
    const before = (await rows().findOneBy({ channelId: storeA.channelId }))!;
    const { state } = await startFlow(storeB);
    mp.grants.set('code-b', grant(111));

    const result = await callback({ code: 'code-b', state });

    expect(result.location.searchParams.get('mp')).toBe('error');
    expect(result.location.searchParams.get('reason')).toBe('account_already_linked');
    expect(await rows().findOneBy({ channelId: storeB.channelId })).toBeNull();
    const after = (await rows().findOneBy({ channelId: storeA.channelId }))!;
    expect(after.accessToken).toBe(before.accessToken);
    expect(after.refreshToken).toBe(before.refreshToken);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('treats the same account on the same store as a reconnection and updates its tokens', async () => {
    const before = (await rows().findOneBy({ channelId: storeA.channelId }))!;
    const { state } = await startFlow(storeA);
    mp.grants.set('code-a2', grant(111));

    const result = await callback({ code: 'code-a2', state });

    expect(result.location.searchParams.get('mp')).toBe('connected');
    expect(await rows().count({ where: { mpUserId: '111' } })).toBe(1);
    const after = (await rows().findOneBy({ channelId: storeA.channelId }))!;
    expect(after.id).toBe(before.id);
    expect(after.accessToken).not.toBe(before.accessToken);
  });

  it('lets a different store link its own account', async () => {
    const { state } = await startFlow(storeB);
    mp.grants.set('code-b2', grant(222));

    expect((await callback({ code: 'code-b2', state })).location.searchParams.get('mp')).toBe(
      'connected',
    );
    expect((await rows().findOneBy({ channelId: storeB.channelId }))!.mpUserId).toBe('222');
  });

  it('rejects a grant without offline_access, because it could not be renewed', async () => {
    const { state } = await startFlow(storeA);
    mp.grants.set('code-x', grant(333, { scope: 'read write' }));
    const before = (await rows().findOneBy({ channelId: storeA.channelId }))!;

    const result = await callback({ code: 'code-x', state });

    expect(result.location.searchParams.get('reason')).toBe('missing_offline_access');
    expect((await rows().findOneBy({ channelId: storeA.channelId }))!.accessToken).toBe(
      before.accessToken,
    );
  });

  it('reports a failed exchange (invalid or expired code) without linking anything', async () => {
    const { state } = await startFlow(storeB);
    const before = (await rows().findOneBy({ channelId: storeB.channelId }))!;

    const result = await callback({ code: 'unknown-code', state });

    expect(result.location.searchParams.get('reason')).toBe('exchange_failed');
    expect((await rows().findOneBy({ channelId: storeB.channelId }))!.accessToken).toBe(
      before.accessToken,
    );
  });

  it('only lets administrators with the permission start a connection', async () => {
    await asStoreAdmin(adminClient, noPermission);
    await expect(adminClient.query(START)).rejects.toThrow(/not currently authorized/i);
  });

  it('refuses to connect the default channel, which is never a store', async () => {
    await asSuperAdmin(adminClient);
    await expect(adminClient.query(START)).rejects.toThrow(/store channel/i);
  });

  it('disconnect removes the credentials so another store can use the account', async () => {
    await asStoreAdmin(adminClient, storeB);
    const { disconnectMercadoPago } = await adminClient.query(gql`
      mutation {
        disconnectMercadoPago
      }
    `);

    expect(disconnectMercadoPago).toBe(true);
    expect(await rows().findOneBy({ channelId: storeB.channelId })).toBeNull();
  });
});
