import { ConfigService, EventBus, TransactionalConnection } from '@vendure/core';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MercadoPagoAttentionEvent,
  MercadoPagoConnection,
  MercadoPagoConnectionService,
  REFRESH_TASK_ID,
} from '../src';
import { AccountAlreadyLinkedError } from '../src/services/connection.service';
import { MercadoPagoMock, OAuthGrant } from './mp-mock';
import { createMpTestEnvironment, createStore, TestStore } from './test-env';

const { server, adminClient, init } = createMpTestEnvironment(3102);
const mp = new MercadoPagoMock();

let connections: MercadoPagoConnectionService;
let storeA: TestStore;
let storeB: TestStore;
let storeC: TestStore;
const events: MercadoPagoAttentionEvent[] = [];

const grant = (
  userId: number,
  suffix: string,
  overrides: Partial<OAuthGrant> = {},
): OAuthGrant => ({
  access_token: `APP_USR-access-${userId}-${suffix}`,
  refresh_token: `TG-refresh-${userId}-${suffix}`,
  user_id: userId,
  expires_in: 15552000,
  scope: 'offline_access read write',
  ...overrides,
});

const rows = () =>
  server.app.get(TransactionalConnection).rawConnection.getRepository(MercadoPagoConnection);
const DAY = 86_400_000;
const setExpiry = (store: TestStore, days: number) =>
  rows().update({ channelId: store.channelId }, { expiresAt: new Date(Date.now() + days * DAY) });

beforeAll(async () => {
  mp.start();
  await init();
  connections = server.app.get(MercadoPagoConnectionService);
  server.app
    .get(EventBus)
    .ofType(MercadoPagoAttentionEvent)
    .subscribe((event) => events.push(event));
  storeA = await createStore(adminClient, 'conn-a');
  storeB = await createStore(adminClient, 'conn-b');
  storeC = await createStore(adminClient, 'conn-c');
}, 120_000);

afterAll(async () => {
  mp.stop();
  await server.destroy();
});

beforeEach(async () => {
  mp.reset();
  events.length = 0;
  await rows().clear();
});

describe('token renewal (PRD 9.4)', () => {
  it('stores both the new access token and the rotated refresh token, encrypted', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    const renewed = grant(1, 'v2');
    mp.refreshGrants.set('TG-refresh-1-v1', renewed);
    const before = (await connections.findByChannelId(storeA.channelId))!;

    const after = await connections.refresh(storeA.channelId);

    const [request] = mp.requestsTo('POST', '/oauth/token');
    expect(request!.body).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'TG-refresh-1-v1',
      client_id: 'test-client-id',
    });
    expect(after.refreshToken).not.toBe(before.refreshToken);
    expect(after.accessToken).not.toBe(before.accessToken);
    expect(after.refreshToken).not.toContain('TG-refresh');
    // The stored refresh token is the new one: renewing again must send it, not the old one.
    mp.refreshGrants.set('TG-refresh-1-v2', grant(1, 'v3'));
    await connections.refresh(storeA.channelId);
    expect(mp.requestsTo('POST', '/oauth/token')[1]!.body!.refresh_token).toBe('TG-refresh-1-v2');
  });

  it('shares one request between concurrent renewals of the same store', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    mp.refreshGrants.set('TG-refresh-1-v1', grant(1, 'v2'));

    await Promise.all([
      connections.refresh(storeA.channelId),
      connections.refresh(storeA.channelId),
      connections.refresh(storeA.channelId),
    ]);

    expect(mp.requestsTo('POST', '/oauth/token')).toHaveLength(1);
  });

  it('marks the connection expiring and raises an alert when renewal fails', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));

    await expect(connections.refresh(storeA.channelId)).rejects.toThrow();

    const row = (await connections.findByChannelId(storeA.channelId))!;
    expect(row.status).toBe('expiring');
    expect(row.lastError).toBeTruthy();
    expect(events.map((e) => [e.reason, e.channelId])).toEqual([
      ['token_renewal_failed', storeA.channelId],
    ]);
    // Still usable until the access token itself expires.
    expect(connections.isUsable(row)).toBe(true);
  });

  it('renews only the connections that expire within the window', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    await connections.link(storeB.channelId, grant(2, 'b1'));
    await connections.link(storeC.channelId, grant(3, 'c1'));
    await setExpiry(storeA, 10);
    await setExpiry(storeB, 100);
    await connections.markDisconnected(storeC.channelId, 'revoked');
    mp.refreshGrants.set('TG-refresh-1-a1', grant(1, 'a2'));
    mp.refreshGrants.set('TG-refresh-2-b1', grant(2, 'b2'));

    const result = await connections.refreshExpiring();

    expect(result).toEqual({ refreshed: 1, failed: 0 });
    expect(mp.requestsTo('POST', '/oauth/token')).toHaveLength(1);
    expect(
      (await connections.findByChannelId(storeA.channelId))!.expiresAt.getTime(),
    ).toBeGreaterThan(Date.now() + 100 * DAY);
  });

  it('keeps going when one store fails and counts it', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    await connections.link(storeB.channelId, grant(2, 'b1'));
    await setExpiry(storeA, 5);
    await setExpiry(storeB, 5);
    mp.refreshGrants.set('TG-refresh-2-b1', grant(2, 'b2'));

    expect(await connections.refreshExpiring()).toEqual({ refreshed: 1, failed: 1 });
    expect((await connections.findByChannelId(storeA.channelId))!.status).toBe('expiring');
    expect((await connections.findByChannelId(storeB.channelId))!.status).toBe('connected');
  });

  it('is registered as a daily scheduled task', () => {
    const tasks = server.app.get(ConfigService).schedulerOptions.tasks ?? [];
    expect(tasks.map((t) => t.id)).toContain(REFRESH_TASK_ID);
  });
});

describe('expired token (PRD 12)', () => {
  it('renews on the spot when the token is expired and the refresh token still works', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    await setExpiry(storeA, -1);
    mp.refreshGrants.set('TG-refresh-1-v1', grant(1, 'v2'));

    const { accessToken } = await connections.getAccessToken(storeA.channelId);

    expect(accessToken).toBe('APP_USR-access-1-v2');
  });

  it('refuses to hand out a token that expired and cannot be renewed', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    await setExpiry(storeA, -1);

    await expect(connections.getAccessToken(storeA.channelId)).rejects.toThrow(
      /must link its account again/,
    );
    expect(connections.isUsable((await connections.findByChannelId(storeA.channelId))!)).toBe(
      false,
    );
  });

  it('refuses a store that has no connection or was disconnected', async () => {
    await expect(connections.getAccessToken(storeA.channelId)).rejects.toThrow(/not connected/);
    await connections.link(storeA.channelId, grant(1, 'v1'));
    await connections.markDisconnected(storeA.channelId, 'revoked');
    await expect(connections.getAccessToken(storeA.channelId)).rejects.toThrow(/not connected/);
  });
});

describe('mp-connect notifications (PRD 9.4)', () => {
  it('ignores accounts it does not know', async () => {
    expect(await connections.reconcileAfterConnectNotification('999')).toBe('unknown_account');
    expect(mp.requests).toHaveLength(0);
  });

  it('keeps the store connected when its token still works', async () => {
    const tokens = grant(1, 'v1');
    await connections.link(storeA.channelId, tokens);
    mp.validTokens.add(tokens.access_token);

    expect(await connections.reconcileAfterConnectNotification('1')).toBe('still_connected');
    expect((await connections.findByChannelId(storeA.channelId))!.status).toBe('connected');
    expect(events).toHaveLength(0);
  });

  it('marks the store disconnected, drops its tokens and alerts when access was revoked', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    // /users/me answers 401 and the refresh token is rejected too: the authorization is gone.

    expect(await connections.reconcileAfterConnectNotification('1')).toBe('disconnected');

    const row = (await connections.findByChannelId(storeA.channelId))!;
    expect(row.status).toBe('disconnected');
    expect(row.accessToken).toBe('');
    expect(row.refreshToken).toBe('');
    expect(connections.isUsable(row)).toBe(false);
    expect(events.map((e) => e.reason)).toContain('account_disconnected');
  });

  it('does not disconnect when Mercado Pago is merely unavailable', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    mp.server.use(
      http.get(
        'https://api.mercadopago.com/users/me',
        () => new HttpResponse(null, { status: 503 }),
      ),
    );

    await expect(connections.reconcileAfterConnectNotification('1')).rejects.toThrow();
    expect((await connections.findByChannelId(storeA.channelId))!.status).toBe('connected');
  });
});

describe('one account, one store', () => {
  it('rejects linking an account that a connected store already uses', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    const before = (await connections.findByChannelId(storeA.channelId))!;

    await expect(connections.link(storeB.channelId, grant(1, 'b1'))).rejects.toBeInstanceOf(
      AccountAlreadyLinkedError,
    );

    expect((await connections.findByChannelId(storeA.channelId))!.accessToken).toBe(
      before.accessToken,
    );
    expect(await connections.findByChannelId(storeB.channelId)).toBeNull();
  });

  it('lets another store take over an account whose access was revoked', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    await connections.markDisconnected(storeA.channelId, 'revoked');

    await connections.link(storeB.channelId, grant(1, 'b1'));

    expect((await connections.findByMpUserId('1'))!.channelId).toBe(storeB.channelId);
    expect(await connections.findByChannelId(storeA.channelId)).toBeNull();
  });

  it('replaces the account of a store that links a different one', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));

    await connections.link(storeA.channelId, grant(7, 'a7'));

    expect((await connections.findByChannelId(storeA.channelId))!.mpUserId).toBe('7');
    expect(await rows().count()).toBe(1);
  });
});
