import { EventBus, TransactionalConnection } from '@vendure/core';
import gql from 'graphql-tag';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MercadoPagoAttentionEvent,
  MercadoPagoChannelLink,
  MercadoPagoConnectionService,
  MercadoPagoPreference,
} from '../src';
import { MercadoPagoPaymentClaim } from '../src/entities/mercadopago-payment-claim.entity';
import { MercadoPagoPaymentProcessor } from '../src/services/payment-processor.service';
import { MercadoPagoAccount } from '../src';
import { MercadoPagoMock, MockPayment, OAuthGrant } from './mp-mock';
import {
  checkoutAsGuest,
  issuedFor,
  notesOf,
  PayableStore,
  provisionStore,
  readOrder,
  STOREFRONT_URL,
  useIssuer,
} from './shop-helpers';
import { createMpTestEnvironment, createStore, TestStore } from './test-env';

/**
 * A payment settles an order only if it belongs to a preference the platform issued for that order
 * (PRD 9.7). These cases are the ways somebody who holds a Mercado Pago account could try to settle
 * an order with money that is not the order's, and the ways the proof itself can be missing.
 */
const { server, adminClient, shopClient, init } = createMpTestEnvironment(3113);
const mp = new MercadoPagoMock();

let storeA: TestStore;
let storeB: TestStore;
let payableA: PayableStore;
let payableB: PayableStore;
let connections: MercadoPagoConnectionService;
let processor: MercadoPagoPaymentProcessor;
const events: MercadoPagoAttentionEvent[] = [];

const grantOf = (userId: number): OAuthGrant => ({
  access_token: `APP_USR-issuance-${userId}`,
  refresh_token: `TG-issuance-${userId}`,
  user_id: userId,
  expires_in: 15552000,
  scope: 'offline_access',
});
const X = 9401;
const Y = 9402;
const gx = grantOf(X);
const gy = grantOf(Y);

const repo = <T extends object>(entity: new () => T) =>
  server.app.get(TransactionalConnection).rawConnection.getRepository(entity);
const claims = () => repo(MercadoPagoPaymentClaim);

let nextId = 8000;
/** A payment collected by `grant`'s account, carrying whatever reference and preference it is told. */
function pay(
  order: { totalWithTax: number },
  grant: OAuthGrant,
  fields: { external_reference: string; preferenceId?: string | null },
  overrides: Partial<MockPayment> = {},
) {
  return mp.addPayment({
    id: ++nextId,
    status: 'approved',
    transaction_amount: order.totalWithTax / 100,
    currency_id: 'ARS',
    ownerToken: grant.access_token,
    collector_id: grant.user_id,
    ...fields,
    ...overrides,
  });
}

/** What Mercado Pago sends: the payment of the notification and the seller it belongs to. */
const notify = (payment: { id: number }, userId: number) =>
  processor.process({ mpPaymentId: String(payment.id), mpUserId: String(userId) });

const stateOf = async (store: TestStore, code: string) =>
  (await readOrder(adminClient, store, code)).state;
const reasons = () => events.map((e) => e.reason);

const ADD_PAYMENT = gql`
  mutation ($input: PaymentInput!) {
    addPaymentToOrder(input: $input) {
      __typename
      ... on Order {
        state
      }
      ... on ErrorResult {
        errorCode
      }
    }
  }
`;
const SYNC = gql`
  mutation ($externalReference: String!, $paymentId: String!) {
    syncMercadoPagoPayment(externalReference: $externalReference, paymentId: $paymentId) {
      __typename
      ... on MercadoPagoPaymentSync {
        outcome
        orderCode
        orderState
      }
      ... on MercadoPagoError {
        reason
      }
    }
  }
`;

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
  storeA = await createStore(adminClient, 'pi-a', { storefrontUrl: STOREFRONT_URL });
  storeB = await createStore(adminClient, 'pi-b', { storefrontUrl: STOREFRONT_URL });
  payableA = await provisionStore(adminClient, storeA);
  payableB = await provisionStore(adminClient, storeB);
}, 120_000);

afterAll(async () => {
  mp.stop();
  await server.destroy();
});

beforeEach(async () => {
  mp.reset();
  events.length = 0;
  await repo(MercadoPagoPreference).createQueryBuilder().delete().execute();
  await repo(MercadoPagoChannelLink).createQueryBuilder().delete().execute();
  await repo(MercadoPagoAccount).createQueryBuilder().delete().execute();
});

describe('a payment from the preference the platform issued', () => {
  it('settles the order', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    const issued = issuedFor(order);
    const payment = pay(order, gx, {
      external_reference: issued.externalReference,
      preferenceId: issued.preferenceId,
    });

    expect(await notify(payment, X)).toMatchObject({ outcome: 'settled', orderCode: order.code });

    expect(await stateOf(storeA, order.code)).toBe('PaymentSettled');
    expect(events).toHaveLength(0);
  });

  it('settles a pending payment approved after the store retired the account', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    const issued = issuedFor(order);
    const payment = pay(
      order,
      gx,
      { external_reference: issued.externalReference, preferenceId: issued.preferenceId },
      { status: 'pending' },
    );
    expect(await notify(payment, X)).toMatchObject({ outcome: 'pending' });
    await connections.retire(storeA.channelId);
    payment.status = 'approved';

    expect(await notify(payment, X)).toMatchObject({ outcome: 'settled' });

    expect(await stateOf(storeA, order.code)).toBe('PaymentSettled');
  });
});

describe('a payment without a preference issued for it', () => {
  it('that carries the bare order code (the old format) does not settle, and waits for review', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    const payment = pay(order, gx, { external_reference: order.code, preferenceId: 'pref-x' });

    expect(await notify(payment, X)).toMatchObject({
      outcome: 'needs_review',
      reason: 'unknown_preference',
    });

    expect(await stateOf(storeA, order.code)).toBe('ArrangingPayment');
    expect(await claims().findOneByOrFail({ mpPaymentId: String(payment.id) })).toMatchObject({
      status: 'needs_review',
    });
    expect(reasons()).toEqual(['unknown_preference']);
    expect(notesOf(await readOrder(adminClient, storeA, order.code)).join('\n')).toContain(
      'does not belong to a preference this platform issued',
    );
  });

  it('whose reference only looks like an issued one is ignored: it is no preference and no order', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    const issued = issuedFor(order);
    const payment = pay(order, gx, {
      external_reference: `${issued.externalReference}0`,
      preferenceId: issued.preferenceId,
    });

    expect(await notify(payment, X)).toEqual({ outcome: 'ignored', reason: 'order_not_found' });

    expect(await stateOf(storeA, order.code)).toBe('ArrangingPayment');
  });

  it('is still recorded when it is not an approval: a chargeback alert is never lost', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    const payment = pay(
      order,
      gx,
      { external_reference: order.code, preferenceId: 'pref-x' },
      { status: 'charged_back' },
    );

    expect(await notify(payment, X)).toMatchObject({ outcome: 'reversed', orderCode: order.code });

    expect(reasons()).toEqual(['payment_reversed']);
  });
});

describe('a payment from a preference issued for another order', () => {
  it('does not settle the order a buyer names through addPaymentToOrder', async () => {
    await connections.link(storeA.channelId, gx);
    const other = await checkoutAsGuest(shopClient, storeA, payableA);
    const issuedForOther = issuedFor(other);
    const payment = pay(other, gx, {
      external_reference: issuedForOther.externalReference,
      preferenceId: issuedForOther.preferenceId,
    });
    // The buyer now has another order and tries to settle it with that payment.
    const mine = await checkoutAsGuest(shopClient, storeA, payableA);

    const { addPaymentToOrder } = await shopClient.query(ADD_PAYMENT, {
      input: { method: 'mercado-pago', metadata: { mpPaymentId: String(payment.id) } },
    });

    expect(addPaymentToOrder.errorCode).toBe('PAYMENT_FAILED_ERROR');
    expect(await stateOf(storeA, mine.code)).toBe('ArrangingPayment');
    expect(await stateOf(storeA, other.code)).toBe('ArrangingPayment');
    expect(reasons()).toEqual(['unknown_preference']);
  });
});

describe('a payment collected by another account than the preference one', () => {
  it('does not settle even when the collector is the account that read it', async () => {
    // X issued the preference for store A. Y is the account of store B: Y has tokens, pays with its
    // own money, and copies the reference of A's order.
    await connections.link(storeA.channelId, gx);
    await connections.link(storeB.channelId, gy);
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    const issued = issuedFor(order);
    const payment = pay(order, gy, {
      external_reference: issued.externalReference,
      preferenceId: issued.preferenceId,
    });

    // Read with Y (the notification names Y), collected by Y: the collector rule alone is satisfied.
    expect(await notify(payment, Y)).toMatchObject({
      outcome: 'needs_review',
      reason: 'collector_mismatch',
    });

    expect(await stateOf(storeA, order.code)).toBe('ArrangingPayment');
    expect(reasons()).toEqual(['collector_mismatch']);
  });
});

describe('a payment that copies the reference of an issued preference but comes from another one', () => {
  // The transfer attack: store A sold with X, B took X, and B (holder of X) pays an unpaid order of A
  // with a payment of its own, repeating the reference of A's preference.
  async function transfer() {
    await connections.link(storeA.channelId, gx);
    const orderOfA = await checkoutAsGuest(shopClient, storeA, payableA); // issued with X
    await connections.retire(storeA.channelId);
    await connections.link(storeB.channelId, gx);
    const orderOfB = await checkoutAsGuest(shopClient, storeB, payableB); // issued with X, for B
    const forged = pay(orderOfA, gx, {
      external_reference: issuedFor(orderOfA).externalReference,
      preferenceId: issuedFor(orderOfB).preferenceId, // B's own preference
    });
    return { orderOfA, orderOfB, forged };
  }

  it('does not settle with a retired link', async () => {
    const { orderOfA, forged } = await transfer();

    expect(await notify(forged, X)).toMatchObject({
      outcome: 'needs_review',
      reason: 'preference_mismatch',
    });

    expect(await stateOf(storeA, orderOfA.code)).toBe('ArrangingPayment');
    expect(reasons()).toEqual(['preference_mismatch']);
    expect(notesOf(await readOrder(adminClient, storeA, orderOfA.code)).join('\n')).toContain(
      issuedFor(orderOfA).preferenceId,
    );
  });

  it('does not settle with a released link whose account still has tokens', async () => {
    const { orderOfA, forged } = await transfer();
    await repo(MercadoPagoChannelLink).update(
      { channelId: storeA.channelId },
      { status: 'released', releasedAt: new Date() },
    );

    expect(await notify(forged, X)).toMatchObject({
      outcome: 'needs_review',
      reason: 'preference_mismatch',
    });

    expect(await stateOf(storeA, orderOfA.code)).toBe('ArrangingPayment');
  });

  it('does not settle through the sync mutation either, and it only answers for its own store', async () => {
    const { orderOfA, forged } = await transfer();
    const sync = () =>
      shopClient.query(SYNC, {
        externalReference: issuedFor(orderOfA).externalReference,
        paymentId: String(forged.id),
      });

    // From the channel of store B the preference of A's order is not its business.
    shopClient.setChannelToken(storeB.token);
    expect((await sync()).syncMercadoPagoPayment).toMatchObject({
      __typename: 'MercadoPagoError',
      reason: 'ORDER_MISMATCH',
    });
    // From A's own channel the payment is read, and refused.
    shopClient.setChannelToken(storeA.token);
    expect((await sync()).syncMercadoPagoPayment).toMatchObject({ outcome: 'needs_review' });

    expect(await stateOf(storeA, orderOfA.code)).toBe('ArrangingPayment');
  });

  it('is still recorded and alerted when it is a chargeback', async () => {
    const { orderOfA, forged } = await transfer();
    forged.status = 'charged_back';

    expect(await notify(forged, X)).toMatchObject({
      outcome: 'reversed',
      orderCode: orderOfA.code,
    });

    expect(reasons()).toEqual(['payment_reversed']);
  });
});

describe('when the preference of the payment cannot be found out', () => {
  async function prepare(overrides: Partial<MockPayment> = {}) {
    await connections.link(storeA.channelId, gx);
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    const issued = issuedFor(order);
    const payment = pay(
      order,
      gx,
      { external_reference: issued.externalReference, preferenceId: issued.preferenceId },
      overrides,
    );
    return { order, payment };
  }

  it('a payment without an order does not settle', async () => {
    const { order, payment } = await prepare({ order: null });

    expect(await notify(payment, X)).toMatchObject({
      outcome: 'needs_review',
      reason: 'unknown_preference',
    });

    expect(await stateOf(storeA, order.code)).toBe('ArrangingPayment');
    expect(notesOf(await readOrder(adminClient, storeA, order.code)).join('\n')).toContain(
      'could not be obtained',
    );
  });

  it('an order that does not name its preference does not settle', async () => {
    const { order, payment } = await prepare({
      preferenceId: null,
      order: { id: 1, type: 'mercadopago' },
    });
    mp.merchantOrders.set(1, payment);

    expect(await notify(payment, X)).toMatchObject({
      outcome: 'needs_review',
      reason: 'unknown_preference',
    });

    expect(await stateOf(storeA, order.code)).toBe('ArrangingPayment');
  });

  it('an order Mercado Pago does not know does not settle', async () => {
    const { order, payment } = await prepare({ order: { id: 424242, type: 'mercadopago' } });
    mp.merchantOrders.delete(424242); // the payment names an order Mercado Pago has never heard of

    expect(await notify(payment, X)).toMatchObject({
      outcome: 'needs_review',
      reason: 'unknown_preference',
    });

    expect(await stateOf(storeA, order.code)).toBe('ArrangingPayment');
  });

  it('a Mercado Pago outage is not an answer: nothing is judged and the notification is retried', async () => {
    const { order, payment } = await prepare();
    mp.merchantOrderStatus = 503;

    await expect(notify(payment, X)).rejects.toThrow();

    // Nothing was recorded against the payment: it is neither settled nor sent to review.
    expect(await stateOf(storeA, order.code)).toBe('ArrangingPayment');
    expect(await claims().findOneBy({ mpPaymentId: String(payment.id) })).toBeNull();
    expect(events).toHaveLength(0);

    mp.merchantOrderStatus = 200;
    expect(await notify(payment, X)).toMatchObject({ outcome: 'settled' });
  });
});

describe('the sync mutation (PRD 9.6 step 6)', () => {
  it('answers unknown, and asks Mercado Pago nothing, for a reference nobody issued', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    const payment = pay(order, gx, { external_reference: order.code, preferenceId: 'pref-x' });
    mp.requests = [];

    for (const externalReference of [
      order.code,
      'NOPE-AAAAAAAAAAAAAAAAAAAAAA',
      '',
      'x'.repeat(300),
    ]) {
      const { syncMercadoPagoPayment } = await shopClient.query(SYNC, {
        externalReference,
        paymentId: String(payment.id),
      });
      expect(syncMercadoPagoPayment).toEqual({
        __typename: 'MercadoPagoPaymentSync',
        outcome: 'unknown',
        orderCode: '',
        orderState: '',
      });
    }

    expect(mp.requests).toEqual([]);
    expect(await stateOf(storeA, order.code)).toBe('ArrangingPayment');
  });

  it('settles with the reference exactly as the redirect brings it', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    const issued = issuedFor(order);
    const payment = pay(order, gx, {
      external_reference: issued.externalReference,
      preferenceId: issued.preferenceId,
    });

    const { syncMercadoPagoPayment } = await shopClient.query(SYNC, {
      externalReference: issued.externalReference,
      paymentId: String(payment.id),
    });

    expect(syncMercadoPagoPayment).toEqual({
      __typename: 'MercadoPagoPaymentSync',
      outcome: 'settled',
      orderCode: order.code,
      orderState: 'PaymentSettled',
    });
  });
});

describe('the handler (addPaymentToOrder)', () => {
  it('settles a payment from a preference issued for the order', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    const issued = issuedFor(order);
    const payment = pay(order, gx, {
      external_reference: issued.externalReference,
      preferenceId: issued.preferenceId,
    });

    const { addPaymentToOrder } = await shopClient.query(ADD_PAYMENT, {
      input: { method: 'mercado-pago', metadata: { mpPaymentId: String(payment.id) } },
    });

    expect(addPaymentToOrder).toMatchObject({ __typename: 'Order', state: 'PaymentSettled' });
  });

  it('refuses an order no preference was issued for', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    await repo(MercadoPagoPreference).createQueryBuilder().delete().execute();
    const payment = pay(order, gx, { external_reference: order.code, preferenceId: 'pref-x' });

    const { addPaymentToOrder } = await shopClient.query(ADD_PAYMENT, {
      input: { method: 'mercado-pago', metadata: { mpPaymentId: String(payment.id) } },
    });

    expect(addPaymentToOrder.errorCode).toBe('PAYMENT_FAILED_ERROR');
    expect(await stateOf(storeA, order.code)).toBe('ArrangingPayment');
  });
});
