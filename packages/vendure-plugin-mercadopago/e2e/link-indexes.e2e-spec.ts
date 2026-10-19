import { TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MercadoPagoAccount,
  MercadoPagoChannelLink,
  MercadoPagoConnectionService,
  MercadoPagoReleaseService,
} from '../src';
import { AccountAlreadyLinkedError } from '../src/services/connection.service';
import { OAuthGrant } from './mp-mock';
import { createMpTestEnvironment, createStore, postgresAvailable, TestStore } from './test-env';

/**
 * The rules "a store sells with one account" and "an account sells for one store" live in partial
 * unique indexes, so they hold whatever the code does. They are proven on PostgreSQL, which is what
 * production runs, writing straight to the tables so no service logic can mask a missing index.
 */
const suite = postgresAvailable ? describe : describe.skip;

suite('link indexes on PostgreSQL (PRD 9.3, 16.7)', () => {
  const { server, adminClient, init } = createMpTestEnvironment(3110, {}, {}, 'postgres');
  let storeA: TestStore;
  let storeB: TestStore;
  let connections: MercadoPagoConnectionService;

  const accounts = () =>
    server.app.get(TransactionalConnection).rawConnection.getRepository(MercadoPagoAccount);
  const links = () =>
    server.app.get(TransactionalConnection).rawConnection.getRepository(MercadoPagoChannelLink);

  const grant = (userId: number): OAuthGrant => ({
    access_token: `APP_USR-idx-${userId}`,
    refresh_token: `TG-idx-${userId}`,
    user_id: userId,
    expires_in: 15552000,
    scope: 'offline_access',
  });

  async function account(mpUserId: string) {
    return accounts().save(
      accounts().create({
        mpUserId,
        accessToken: 'cipher',
        refreshToken: 'cipher',
        publicKey: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        scope: null,
        status: 'connected',
        lastError: null,
      }),
    );
  }

  const link = (
    store: TestStore,
    acc: MercadoPagoAccount,
    status: 'active' | 'retired' | 'released',
  ) =>
    links().save(
      links().create({
        channelId: store.channelId,
        accountId: acc.id,
        status,
        linkedAt: new Date(),
        retiredAt: status === 'active' ? null : new Date(),
        releasedAt: status === 'released' ? new Date() : null,
      }),
    );

  beforeAll(async () => {
    await init();
    connections = server.app.get(MercadoPagoConnectionService);
    storeA = await createStore(adminClient, 'ix-a');
    storeB = await createStore(adminClient, 'ix-b');
  }, 120_000);

  afterAll(async () => {
    await server.destroy();
  });

  beforeEach(async () => {
    await links().createQueryBuilder().delete().execute();
    await accounts().createQueryBuilder().delete().execute();
  });

  it('refuses a second active link in the same store', async () => {
    const [x, y] = [await account('1'), await account('2')];
    await link(storeA, x, 'active');

    await expect(link(storeA, y, 'active')).rejects.toThrow(/IDX_mp_link_one_active_per_channel/);
    expect(await links().count()).toBe(1);
  });

  it('refuses one account active in two stores', async () => {
    const x = await account('1');
    await link(storeA, x, 'active');

    await expect(link(storeB, x, 'active')).rejects.toThrow(/IDX_mp_link_one_active_per_account/);
    expect(await links().count()).toBe(1);
  });

  it('lets retired and released links pile up without blocking anything', async () => {
    const [x, y, z] = [await account('1'), await account('2'), await account('3')];
    // Several non-active links for one store and for one account.
    await link(storeA, x, 'retired');
    await link(storeA, y, 'retired');
    await link(storeA, z, 'released');
    await link(storeB, x, 'retired');
    await link(storeB, x, 'released');
    // And the store and the account can still have their one active link.
    await link(storeA, x, 'active');
    await link(storeB, y, 'active');

    expect(await links().count()).toBe(7);
    expect(await links().count({ where: { status: 'active' } })).toBe(2);
  });

  it('a link cannot point at an account that does not exist', async () => {
    await expect(
      links().save(
        links().create({
          channelId: storeA.channelId,
          accountId: 999999, // the test environment uses integer ids
          status: 'retired',
          linkedAt: new Date(),
          retiredAt: new Date(),
          releasedAt: null,
        }),
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it('only one of two stores racing for a new account gets it, and the other changes nothing', async () => {
    const racing = grant(77);

    const results = await Promise.allSettled([
      connections.link(storeA.channelId, racing),
      connections.link(storeB.channelId, racing),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(AccountAlreadyLinkedError);
    expect(await accounts().count()).toBe(1);
    expect(await links().count()).toBe(1);
  });

  it('a store racing with itself to change account ends with exactly one active link, and no error', async () => {
    await connections.link(storeA.channelId, grant(1));

    const results = await Promise.allSettled([
      connections.link(storeA.channelId, grant(2)),
      connections.link(storeA.channelId, grant(3)),
    ]);

    // Both are the same store changing account: the loser retries, so neither is told the account
    // "belongs to another store".
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await links().count({ where: { channelId: storeA.channelId, status: 'active' } })).toBe(
      1,
    );
  });

  it('releasing a link while its account is linked again never leaves an active link without tokens', async () => {
    const releases = server.app.get(MercadoPagoReleaseService);
    for (let round = 0; round < 8; round++) {
      await links().createQueryBuilder().delete().execute();
      await accounts().createQueryBuilder().delete().execute();
      const racing = grant(500 + round);
      await connections.link(storeA.channelId, racing);
      await connections.retire(storeA.channelId);
      const linkId = (await links().findOneByOrFail({ channelId: storeA.channelId })).id;

      await Promise.allSettled([
        releases.releaseLink(linkId),
        connections.link(storeB.channelId, racing),
      ]);

      const account = await accounts().findOneByOrFail({ mpUserId: String(racing.user_id) });
      const live = await links().count({
        where: { accountId: account.id, status: In(['active', 'retired']) },
      });
      // Tokens exist exactly when some store still uses the account.
      expect(account.accessToken !== '').toBe(live > 0);
      expect(connections.hasTokens(account)).toBe(live > 0);
    }
  });
});
