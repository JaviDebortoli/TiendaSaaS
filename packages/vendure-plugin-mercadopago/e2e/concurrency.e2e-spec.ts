import { EventBus, TransactionalConnection } from '@vendure/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MP_PLUGIN_OPTIONS } from '../src/constants';
import { MercadoPagoAttentionEvent, MercadoPagoConnectionService } from '../src';
import { MercadoPagoAccount } from '../src/entities/mercadopago-account.entity';
import { MercadoPagoChannelLink } from '../src/entities/mercadopago-channel-link.entity';
import { MercadoPagoApiService } from '../src/services/mercadopago-api.service';
import { MercadoPagoCipherService } from '../src/services/cipher.service';
import { MercadoPagoPaymentClaim } from '../src/entities/mercadopago-payment-claim.entity';
import { AccountAlreadyLinkedError } from '../src/services/connection.service';
import { MercadoPagoPaymentProcessor } from '../src/services/payment-processor.service';
import { MercadoPagoMock, OAuthGrant } from './mp-mock';
import {
  checkoutAsGuest,
  PayableStore,
  provisionStore,
  readOrder,
  referenceFields,
  STOREFRONT_URL,
  useIssuer,
} from './shop-helpers';
import { createMpTestEnvironment, createStore, postgresAvailable, TestStore } from './test-env';

/**
 * These cases need a real PostgreSQL: SQL.js has one connection and no row or advisory locks, so
 * it cannot show races. Set TEST_DB_PASSWORD (and optionally TEST_DB_HOST, TEST_DB_PORT,
 * TEST_DB_USERNAME) to run them. CI always does.
 */
const suite = postgresAvailable ? describe : describe.skip;

suite('concurrency on PostgreSQL (PRD 12, 16.7)', () => {
  const { server, adminClient, shopClient, init } = createMpTestEnvironment(
    3108,
    {},
    {},
    'postgres',
  );
  const mp = new MercadoPagoMock();
  const events: MercadoPagoAttentionEvent[] = [];

  let store: TestStore;
  let otherStore: TestStore;
  let payable: PayableStore;
  let connections: MercadoPagoConnectionService;
  let processor: MercadoPagoPaymentProcessor;

  const SELLER = 9001;
  const grant: OAuthGrant = {
    access_token: 'APP_USR-race-token',
    refresh_token: 'TG-race-refresh',
    user_id: SELLER,
    expires_in: 15552000,
    scope: 'offline_access',
  };

  let nextId = 1500;
  const payment = (order: { code: string; totalWithTax: number }) =>
    mp.addPayment({
      id: ++nextId,
      status: 'approved',
      transaction_amount: order.totalWithTax / 100,
      currency_id: 'ARS',
      ...referenceFields(order),
      ownerToken: grant.access_token,
      collector_id: grant.user_id,
    });
  const process = (id: number) =>
    processor.process({ mpPaymentId: String(id), mpUserId: String(SELLER) });

  beforeAll(async () => {
    mp.start();
    await init();
    useIssuer(server.app);
    connections = server.app.get(MercadoPagoConnectionService);
    processor = server.app.get(MercadoPagoPaymentProcessor);
    server.app
      .get(EventBus)
      .ofType(MercadoPagoAttentionEvent)
      .subscribe((event) => events.push(event));
    store = await createStore(adminClient, 'cc-a', { storefrontUrl: STOREFRONT_URL });
    otherStore = await createStore(adminClient, 'cc-b', { storefrontUrl: STOREFRONT_URL });
    payable = await provisionStore(adminClient, store);
    await connections.link(store.channelId, grant);
  }, 180_000);

  afterAll(async () => {
    mp.stop();
    await server.destroy();
  });

  it('the same notification handled by many workers at once adds exactly one payment', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const approved = payment(order);

    const results = await Promise.all(Array.from({ length: 8 }, () => process(approved.id)));

    const outcomes = results.map((r) => r.outcome);
    expect(outcomes.filter((o) => o === 'settled')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'already_settled')).toHaveLength(7);
    const after = await readOrder(adminClient, store, order.code);
    expect(after.state).toBe('PaymentSettled');
    expect(after.payments).toHaveLength(1);
    const claims = await server.app
      .get(TransactionalConnection)
      .rawConnection.getRepository(MercadoPagoPaymentClaim)
      .find({ where: { mpPaymentId: String(approved.id) } });
    expect(claims.map((c) => c.status)).toEqual(['settled']);
  });

  it('two different approved payments racing for one order settle it once and flag the other', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const first = payment(order);
    const second = payment(order);
    events.length = 0;

    const results = await Promise.all([process(first.id), process(second.id)]);

    const after = await readOrder(adminClient, store, order.code);
    expect(after.state).toBe('PaymentSettled');
    expect(after.payments).toHaveLength(1);
    expect(results.map((r) => r.outcome).sort()).toEqual(['needs_review', 'settled']);
    expect(events.map((e) => e.reason)).toEqual(['order_not_payable']);
  });

  it('a payment approved while a worker holds it is not applied twice by the sync path', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const approved = payment(order);

    const results = await Promise.all([
      process(approved.id),
      processor.process({
        mpPaymentId: String(approved.id),
        channelId: store.channelId,
        externalReference: approved.external_reference,
      }),
      process(approved.id),
    ]);

    expect(results.filter((r) => r.outcome === 'settled')).toHaveLength(1);
    expect((await readOrder(adminClient, store, order.code)).payments).toHaveLength(1);
  });

  it('one Mercado Pago account can be linked to only one store, even when two stores race for it', async () => {
    const racing: OAuthGrant = {
      ...grant,
      access_token: 'APP_USR-race-2',
      refresh_token: 'TG-race-2',
      user_id: 9002,
    };

    const results = await Promise.allSettled([
      connections.link(store.channelId, racing),
      connections.link(otherStore.channelId, racing),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(AccountAlreadyLinkedError);
    const active = await server.app
      .get(TransactionalConnection)
      .rawConnection.query(
        `SELECT l.id FROM mercado_pago_channel_link l JOIN mercado_pago_account a ON a.id = l."accountId" WHERE a."mpUserId" = $1 AND l.status = 'active'`,
        ['9002'],
      );
    expect(active).toHaveLength(1);
    // Put the store back on its original account for any later test.
    await connections.link(store.channelId, grant);
  });

  describe('renewing and checking an account from two processes (PRD 9.4)', () => {
    // An account and a store of their own: the race above leaves no say in who holds 9002.
    const OWNER = 9100;
    let lockStore: TestStore;
    const grants = (n: number): OAuthGrant => ({
      access_token: `APP_USR-lock-${n}`,
      refresh_token: `TG-lock-${n}`,
      user_id: OWNER,
      expires_in: 15552000,
      scope: 'offline_access',
    });

    /** What a second server or worker would be: its own service over the same database. */
    const otherProcess = () =>
      new MercadoPagoConnectionService(
        server.app.get(TransactionalConnection),
        server.app.get(MercadoPagoCipherService),
        server.app.get(MercadoPagoApiService),
        server.app.get(EventBus),
        server.app.get(MP_PLUGIN_OPTIONS),
      );
    const connection = () => server.app.get(TransactionalConnection).rawConnection;
    const accountRow = () =>
      connection()
        .getRepository(MercadoPagoAccount)
        .findOneByOrFail({ mpUserId: String(OWNER) });
    const links = async () =>
      (
        await connection()
          .getRepository(MercadoPagoChannelLink)
          .find({ where: { accountId: (await accountRow()).id } })
      ).map((l) => l.status);

    beforeAll(async () => {
      lockStore = await createStore(adminClient, 'cc-lock', { storefrontUrl: STOREFRONT_URL });
      await connections.link(lockStore.channelId, grants(1));
    });

    it('two processes renewing the same account at once spend the refresh token once and revoke nothing', async () => {
      const second = otherProcess();
      const { id } = await accountRow();
      mp.singleUseRefreshTokens = true;
      mp.oauthDelayMs = 150;
      mp.refreshGrants.set(grants(1).refresh_token, grants(2));
      mp.requests = [];
      events.length = 0;

      const results = await Promise.allSettled([connections.refresh(id), second.refresh(id)]);

      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(mp.requestsTo('POST', '/oauth/token')).toHaveLength(1);
      expect((await accountRow()).status).toBe('connected');
      expect(await links()).toEqual(['active']);
      expect(events).toHaveLength(0);
    });

    it('a 401 with a token another process already replaced retires nothing', async () => {
      const stale = await accountRow(); // holds grants(2)
      const other = otherProcess();
      mp.singleUseRefreshTokens = true;
      mp.refreshGrants.set(grants(2).refresh_token, grants(3));
      await other.refresh(stale.id); // the other process renews: grants(3) is stored now
      mp.validTokens.add(grants(3).access_token);
      mp.rejectedTokens.set(grants(2).access_token, 401);
      mp.addPayment({
        id: 4242,
        status: 'approved',
        transaction_amount: 1,
        currency_id: 'ARS',
        external_reference: 'x',
        ownerToken: grants(3).access_token,
        collector_id: OWNER,
      });
      mp.requests = [];
      events.length = 0;

      // This process still has the old row: it reads with the old token and gets the 401.
      const { value, account } = await connections.withAccountToken(stale, (token) =>
        server.app.get(MercadoPagoApiService).getPayment(token, '4242'),
      );

      expect(value.id).toBe(4242);
      expect(account.accessToken).not.toBe(stale.accessToken);
      expect(mp.requestsTo('GET', '/users/me')).toHaveLength(0);
      expect(mp.requestsTo('POST', '/oauth/token')).toHaveLength(0);
      expect((await accountRow()).status).toBe('connected');
      expect(await links()).toEqual(['active']);
      expect(events).toHaveLength(0);
    });

    it('a rejected refresh token under the lock is the only thing that revokes', async () => {
      const second = otherProcess();
      const row = await accountRow();
      mp.rejectedTokens.set(grants(3).access_token, 401);
      mp.validTokens.delete(grants(3).access_token);
      mp.refreshGrants.clear(); // Mercado Pago refuses the refresh token now
      mp.requests = [];
      events.length = 0;

      const verdicts = await Promise.all([
        connections.verifyAccess(row.id, grants(3).access_token),
        second.verifyAccess(row.id, grants(3).access_token),
      ]);

      expect(verdicts.map((v) => v.kind).sort()).toEqual(['no_tokens', 'revoked']);
      expect((await accountRow()).status).toBe('disconnected');
      expect(await links()).toEqual(['retired']);
      expect(events.map((e) => e.reason)).toEqual(['account_disconnected']);
    });
  });
});
