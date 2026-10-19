import { EventBus, TransactionalConnection } from '@vendure/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MercadoPagoAttentionEvent, MercadoPagoConnectionService } from '../src';
import { MercadoPagoPaymentClaim } from '../src/entities/mercadopago-payment-claim.entity';
import { AccountAlreadyLinkedError } from '../src/services/connection.service';
import { MercadoPagoPaymentProcessor } from '../src/services/payment-processor.service';
import { MercadoPagoMock, OAuthGrant } from './mp-mock';
import {
  checkoutAsGuest,
  PayableStore,
  provisionStore,
  readOrder,
  STOREFRONT_URL,
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
      external_reference: order.code,
      ownerToken: grant.access_token,
      collector_id: grant.user_id,
    });
  const process = (id: number) =>
    processor.process({ mpPaymentId: String(id), mpUserId: String(SELLER) });

  beforeAll(async () => {
    mp.start();
    await init();
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
        expectedOrderCode: order.code,
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
});
