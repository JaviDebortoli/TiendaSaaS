import { ConfigService, EventBus, TransactionalConnection } from '@vendure/core';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  accountAccessContext,
  MercadoPagoAccount,
  MercadoPagoAttentionEvent,
  MercadoPagoChannelLink,
  MercadoPagoConnectionService,
  REFRESH_TASK_ID,
  TokenCipher,
} from '../src';
import { AccountAlreadyLinkedError } from '../src/services/connection.service';
import { MercadoPagoMock, OAuthGrant } from './mp-mock';
import { createMpTestEnvironment, createStore, TEST_OPTIONS, TestStore } from './test-env';

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

const accounts = () =>
  server.app.get(TransactionalConnection).rawConnection.getRepository(MercadoPagoAccount);
const links = () =>
  server.app.get(TransactionalConnection).rawConnection.getRepository(MercadoPagoChannelLink);
const DAY = 86_400_000;
const account = (mpUserId: number) => accounts().findOneByOrFail({ mpUserId: String(mpUserId) });
const setExpiry = (mpUserId: number, days: number) =>
  accounts().update(
    { mpUserId: String(mpUserId) },
    { expiresAt: new Date(Date.now() + days * DAY) },
  );
const linkOf = (store: TestStore, mpUserId: number) =>
  links().findOne({
    where: { channelId: store.channelId, account: { mpUserId: String(mpUserId) } },
    relations: { account: true },
  });
const statuses = async (store: TestStore) =>
  Object.fromEntries(
    (await connections.listLinks(store.channelId)).map((l) => [l.account.mpUserId, l.status]),
  );

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
  await links().createQueryBuilder().delete().execute();
  await accounts().createQueryBuilder().delete().execute();
});

describe('token renewal (PRD 9.4)', () => {
  it('stores both the new access token and the rotated refresh token, encrypted for the account', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    const renewed = grant(1, 'v2');
    mp.refreshGrants.set('TG-refresh-1-v1', renewed);
    const before = await account(1);

    const after = await connections.refresh(before.id);

    const [request] = mp.requestsTo('POST', '/oauth/token');
    expect(request!.body).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'TG-refresh-1-v1',
      client_id: 'test-client-id',
    });
    expect(after.refreshToken).not.toBe(before.refreshToken);
    expect(after.accessToken).not.toBe(before.accessToken);
    expect(after.refreshToken).not.toContain('TG-refresh');
    // The ciphertext is bound to the account, not to a store.
    const cipher = new TokenCipher(TEST_OPTIONS.tokenEncryptionKey);
    expect(cipher.decrypt(after.accessToken, accountAccessContext('1'))).toBe(renewed.access_token);
    expect(() => cipher.decrypt(after.accessToken, accountAccessContext('2'))).toThrow();
    // The stored refresh token is the new one: renewing again must send it, not the old one.
    mp.refreshGrants.set('TG-refresh-1-v2', grant(1, 'v3'));
    await connections.refresh(before.id);
    expect(mp.requestsTo('POST', '/oauth/token')[1]!.body!.refresh_token).toBe('TG-refresh-1-v2');
  });

  it('shares one request between concurrent renewals of the same account', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    mp.refreshGrants.set('TG-refresh-1-v1', grant(1, 'v2'));
    const { id } = await account(1);

    await Promise.all([connections.refresh(id), connections.refresh(id), connections.refresh(id)]);

    expect(mp.requestsTo('POST', '/oauth/token')).toHaveLength(1);
  });

  it('never spends the same refresh token twice when two stores share the account', async () => {
    // Store A retired X and store B sells with it: one account, two links.
    await connections.link(storeA.channelId, grant(1, 'v1'));
    await connections.retire(storeA.channelId);
    await connections.link(storeB.channelId, grant(1, 'v1'));
    mp.refreshGrants.set('TG-refresh-1-v1', grant(1, 'v2'));
    // Inside the safety margin, so the token is renewed on the spot, and inside the daily window.
    await accounts().update({ mpUserId: '1' }, { expiresAt: new Date(Date.now() + 30_000) });

    await Promise.all([
      connections.refreshExpiring(),
      connections.getAccessToken(storeB.channelId),
      connections.refresh((await account(1)).id),
    ]);

    const requests = mp.requestsTo('POST', '/oauth/token');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.body!.refresh_token).toBe('TG-refresh-1-v1');
    expect(await accounts().count()).toBe(1);
  });

  it('marks the account expiring and alerts every store that uses it when renewal fails', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    await connections.retire(storeA.channelId);
    await connections.link(storeB.channelId, grant(1, 'v1'));
    const { id } = await account(1);

    await expect(connections.refresh(id)).rejects.toThrow();

    const row = await account(1);
    expect(row.status).toBe('expiring');
    expect(row.lastError).toBeTruthy();
    expect(events.map((e) => [e.reason, e.channelId]).sort()).toEqual(
      [
        ['token_renewal_failed', storeA.channelId],
        ['token_renewal_failed', storeB.channelId],
      ].sort(),
    );
    // Still usable until the access token itself expires.
    expect(connections.isUsable(row)).toBe(true);
    // A failed renewal is not a revocation: the link stays active and the account stays taken.
    expect(await statuses(storeB)).toEqual({ '1': 'active' });
    await expect(connections.link(storeC.channelId, grant(1, 'c1'))).rejects.toBeInstanceOf(
      AccountAlreadyLinkedError,
    );
  });

  it('renews only the accounts some store still uses that expire within the window', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    await connections.link(storeB.channelId, grant(2, 'b1'));
    await connections.link(storeC.channelId, grant(3, 'c1'));
    // Store A changes to account 4 and its link to account 1 is released: nobody needs 1 any more.
    await connections.link(storeA.channelId, grant(4, 'd1'));
    await links().update(
      { channelId: storeA.channelId, status: 'retired' },
      { status: 'released', releasedAt: new Date() },
    );
    await setExpiry(1, 10);
    await setExpiry(2, 100);
    await setExpiry(4, 5);
    await connections.markDisconnected((await account(3)).id, 'revoked');
    mp.refreshGrants.set('TG-refresh-1-a1', grant(1, 'a2'));
    mp.refreshGrants.set('TG-refresh-2-b1', grant(2, 'b2'));
    mp.refreshGrants.set('TG-refresh-4-d1', grant(4, 'd2'));

    const result = await connections.refreshExpiring();

    // 1 has only a released link, 2 is far from expiring and 3 is revoked: only 4 is renewed.
    expect(result).toEqual({ refreshed: 1, failed: 0 });
    const requests = mp.requestsTo('POST', '/oauth/token');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.body!.refresh_token).toBe('TG-refresh-4-d1');
    expect((await account(4)).expiresAt.getTime()).toBeGreaterThan(Date.now() + 100 * DAY);
    expect((await account(1)).expiresAt.getTime()).toBeLessThan(Date.now() + 11 * DAY);
  });

  it('renews an account that only a retired link keeps, because its sales can still be refunded', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    await connections.retire(storeA.channelId);
    await setExpiry(1, 3);
    mp.refreshGrants.set('TG-refresh-1-a1', grant(1, 'a2'));

    expect(await connections.refreshExpiring()).toEqual({ refreshed: 1, failed: 0 });
  });

  it('keeps going when one account fails and counts it', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    await connections.link(storeB.channelId, grant(2, 'b1'));
    await setExpiry(1, 5);
    await setExpiry(2, 5);
    mp.refreshGrants.set('TG-refresh-2-b1', grant(2, 'b2'));

    expect(await connections.refreshExpiring()).toEqual({ refreshed: 1, failed: 1 });
    expect((await account(1)).status).toBe('expiring');
    expect((await account(2)).status).toBe('connected');
  });

  it('is registered as a daily scheduled task', () => {
    const tasks = server.app.get(ConfigService).schedulerOptions.tasks ?? [];
    expect(tasks.map((t) => t.id)).toContain(REFRESH_TASK_ID);
  });
});

describe('expired token (PRD 12)', () => {
  it('renews on the spot when the token is expired and the refresh token still works', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    await setExpiry(1, -1);
    mp.refreshGrants.set('TG-refresh-1-v1', grant(1, 'v2'));

    const { accessToken } = await connections.getAccessToken(storeA.channelId);

    expect(accessToken).toBe('APP_USR-access-1-v2');
  });

  it('refuses to hand out a token that expired and cannot be renewed', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    await setExpiry(1, -1);

    await expect(connections.getAccessToken(storeA.channelId)).rejects.toThrow(
      /must link its account again/,
    );
    expect(connections.isUsable(await account(1))).toBe(false);
  });

  it('refuses a store that has no link, only a retired one, or whose account was revoked', async () => {
    await expect(connections.getAccessToken(storeA.channelId)).rejects.toThrow(/not connected/);
    await connections.link(storeA.channelId, grant(1, 'v1'));
    await connections.retire(storeA.channelId);
    await expect(connections.getAccessToken(storeA.channelId)).rejects.toThrow(/not connected/);
    await connections.link(storeB.channelId, grant(2, 'v1'));
    await connections.markDisconnected((await account(2)).id, 'revoked');
    await expect(connections.getAccessToken(storeB.channelId)).rejects.toThrow(/not connected/);
  });
});

describe('mp-connect notifications (PRD 9.4)', () => {
  it('ignores accounts it does not know', async () => {
    expect(await connections.reconcileAfterConnectNotification('999')).toBe('unknown_account');
    expect(mp.requests).toHaveLength(0);
  });

  it('keeps the account connected when its token still works', async () => {
    const tokens = grant(1, 'v1');
    await connections.link(storeA.channelId, tokens);
    mp.validTokens.add(tokens.access_token);

    expect(await connections.reconcileAfterConnectNotification('1')).toBe('still_connected');
    expect((await account(1)).status).toBe('connected');
    expect(events).toHaveLength(0);
  });

  it('marks the account disconnected, drops its tokens and alerts when access was revoked', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    // /users/me answers 401 and the refresh token is rejected too: the authorization is gone.

    expect(await connections.reconcileAfterConnectNotification('1')).toBe('disconnected');

    const row = await account(1);
    expect(row.status).toBe('disconnected');
    expect(row.accessToken).toBe('');
    expect(row.refreshToken).toBe('');
    expect(connections.isUsable(row)).toBe(false);
    expect(events.map((e) => e.reason)).toContain('account_disconnected');
    // The account belongs to its holder: the store cannot go on with it without authorizing again.
    expect(await statuses(storeA)).toEqual({ '1': 'retired' });
    expect((await linkOf(storeA, 1))!.retiredAt).toBeInstanceOf(Date);
    expect(await connections.findActiveLink(storeA.channelId)).toBeNull();
  });

  it('a body that claims a revocation is not enough: the account and its links stay as they are', async () => {
    const tokens = grant(1, 'v1');
    await connections.link(storeA.channelId, tokens);
    mp.validTokens.add(tokens.access_token); // Mercado Pago says the access still works

    expect(await connections.reconcileAfterConnectNotification('1')).toBe('still_connected');

    expect((await account(1)).status).toBe('connected');
    expect(await statuses(storeA)).toEqual({ '1': 'active' });
  });

  it('does not disconnect when Mercado Pago is merely unavailable', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    mp.server.use(
      // `once`: a handler added with `use` would otherwise outlive this test.
      http.get(
        'https://api.mercadopago.com/users/me',
        () => new HttpResponse(null, { status: 503 }),
        {
          once: true,
        },
      ),
    );

    await expect(connections.reconcileAfterConnectNotification('1')).rejects.toThrow();
    expect((await account(1)).status).toBe('connected');
  });
});

describe('eligibility (PRD 9.4)', () => {
  it('is eligible only while the store has an active link to a usable account', async () => {
    expect(await connections.isChannelUsable(storeA.channelId)).toBe(false);

    await connections.link(storeA.channelId, grant(1, 'v1'));
    expect(await connections.isChannelUsable(storeA.channelId)).toBe(true);

    await connections.retire(storeA.channelId);
    expect(await connections.isChannelUsable(storeA.channelId)).toBe(false);
  });

  it('is not eligible once the access token has expired', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    await setExpiry(1, -1);

    expect(await connections.isChannelUsable(storeA.channelId)).toBe(false);
  });

  it('a revoked account leaves every store without it: none is eligible', async () => {
    await connections.link(storeA.channelId, grant(1, 'v1'));
    await connections.retire(storeA.channelId);
    await connections.link(storeB.channelId, grant(1, 'v1'));
    expect(await connections.isChannelUsable(storeB.channelId)).toBe(true);

    await connections.markDisconnected((await account(1)).id, 'revoked');

    expect(await connections.isChannelUsable(storeA.channelId)).toBe(false);
    expect(await connections.isChannelUsable(storeB.channelId)).toBe(false);
    // The revocation retired the link of the store that still sold with the account.
    expect(await statuses(storeA)).toEqual({ '1': 'retired' });
    expect(await statuses(storeB)).toEqual({ '1': 'retired' });
  });
});

describe('linking an account to a store (PRD 9.2)', () => {
  it('rejects an account that another store sells with, without changing anything', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    const accountBefore = await account(1);
    const linkBefore = (await linkOf(storeA, 1))!;

    await expect(connections.link(storeB.channelId, grant(1, 'b1'))).rejects.toBeInstanceOf(
      AccountAlreadyLinkedError,
    );

    const accountAfter = await account(1);
    expect(accountAfter.accessToken).toBe(accountBefore.accessToken);
    expect(accountAfter.updatedAt.getTime()).toBe(accountBefore.updatedAt.getTime());
    expect((await linkOf(storeA, 1))!.updatedAt.getTime()).toBe(linkBefore.updatedAt.getTime());
    expect(await links().count()).toBe(1);
    expect(await connections.findActiveLink(storeB.channelId)).toBeNull();
  });

  it('lets another store take an account whose access was revoked', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    expect(await connections.reconcileAfterConnectNotification('1')).toBe('disconnected');

    // The revocation retired A's link, so the account is free: the holder authorizes it in B.
    await connections.link(storeB.channelId, grant(1, 'b1'));

    expect(await statuses(storeA)).toEqual({ '1': 'retired' });
    expect(await statuses(storeB)).toEqual({ '1': 'active' });
    expect(connections.isUsable(await account(1))).toBe(true);
  });

  it('authorizing a revoked account again in the same store reactivates its link', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    await connections.markDisconnected((await account(1)).id, 'revoked');
    const linkId = (await linkOf(storeA, 1))!.id;

    await connections.link(storeA.channelId, grant(1, 'a2'));

    expect(await statuses(storeA)).toEqual({ '1': 'active' });
    expect((await linkOf(storeA, 1))!.id).toBe(linkId);
    expect((await linkOf(storeA, 1))!.retiredAt).toBeNull();
    expect((await connections.getAccessToken(storeA.channelId)).accessToken).toBe(
      'APP_USR-access-1-a2',
    );
    expect(await links().count()).toBe(1);
  });

  it('rejects authorizing a revoked account in its original store once another store took it, changing nothing', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    await connections.markDisconnected((await account(1)).id, 'revoked');
    await connections.link(storeB.channelId, grant(1, 'b1'));
    const before = await account(1);

    await expect(connections.link(storeA.channelId, grant(1, 'a2'))).rejects.toBeInstanceOf(
      AccountAlreadyLinkedError,
    );

    expect(await statuses(storeA)).toEqual({ '1': 'retired' });
    expect(await statuses(storeB)).toEqual({ '1': 'active' });
    expect((await account(1)).accessToken).toBe(before.accessToken);
  });

  it('treats the same account on the same store as a reconnection and replaces its tokens', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    const before = await account(1);
    const linkBefore = (await linkOf(storeA, 1))!;

    await connections.link(storeA.channelId, grant(1, 'a2'));

    const after = await account(1);
    expect(after.id).toBe(before.id);
    expect(after.accessToken).not.toBe(before.accessToken);
    expect((await connections.getAccessToken(storeA.channelId)).accessToken).toBe(
      'APP_USR-access-1-a2',
    );
    expect(await links().count()).toBe(1);
    expect((await linkOf(storeA, 1))!.id).toBe(linkBefore.id);
  });

  it('retires the old link and activates the new one when the store changes account', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));

    await connections.link(storeA.channelId, grant(7, 'a7'));

    expect(await statuses(storeA)).toEqual({ '1': 'retired', '7': 'active' });
    const old = (await linkOf(storeA, 1))!;
    expect(old.retiredAt).toBeInstanceOf(Date);
    expect((await connections.getAccessToken(storeA.channelId)).account.mpUserId).toBe('7');
    // The old account keeps its tokens: its sales can still be refunded with them.
    expect(connections.isUsable(await account(1))).toBe(true);
    expect(await accounts().count()).toBe(2);
  });

  it('reactivates the retired link when the store goes back to an account, creating no new one', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    await connections.link(storeA.channelId, grant(7, 'a7'));
    const linkId = (await linkOf(storeA, 1))!.id;
    expect(await links().count()).toBe(2);

    await connections.link(storeA.channelId, grant(1, 'a3'));

    expect(await links().count()).toBe(2);
    expect(await statuses(storeA)).toEqual({ '1': 'active', '7': 'retired' });
    const link = (await linkOf(storeA, 1))!;
    expect(link.id).toBe(linkId);
    expect(link.retiredAt).toBeNull();
  });

  it('lets another store take an account the first one retired', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    await connections.retire(storeA.channelId);

    await connections.link(storeB.channelId, grant(1, 'b1'));

    expect(await statuses(storeA)).toEqual({ '1': 'retired' });
    expect(await statuses(storeB)).toEqual({ '1': 'active' });
    expect(await accounts().count()).toBe(1);
    // The tokens are the new ones, whoever authorized them last.
    expect((await connections.getAccessToken(storeB.channelId)).accessToken).toBe(
      'APP_USR-access-1-b1',
    );
  });

  it('unlinking retires the link and deletes nothing', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));

    expect(await connections.retire(storeA.channelId)).toBe(true);
    expect(await connections.retire(storeA.channelId)).toBe(false);

    expect(await statuses(storeA)).toEqual({ '1': 'retired' });
    expect(connections.isUsable(await account(1))).toBe(true);
  });

  it('a released link does not stop the store from taking the account again', async () => {
    await connections.link(storeA.channelId, grant(1, 'a1'));
    await connections.retire(storeA.channelId);
    await links().update({ channelId: storeA.channelId }, { status: 'released' });

    await connections.link(storeA.channelId, grant(1, 'a2'));

    expect(await statuses(storeA)).toEqual({ '1': 'active' });
    expect((await linkOf(storeA, 1))!.releasedAt).toBeNull();
  });
});
