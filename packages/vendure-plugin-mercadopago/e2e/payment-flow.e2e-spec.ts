import { EventBus } from '@vendure/core';
import gql from 'graphql-tag';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MercadoPagoAttentionEvent, MercadoPagoConnectionService } from '../src';
import { MercadoPagoWebhookService } from '../src/services/webhook.service';
import { MercadoPagoMock, OAuthGrant } from './mp-mock';
import {
  checkoutAsGuest,
  CheckoutOrder,
  issuedFor,
  notesOf,
  PayableStore,
  provisionStore,
  readOrder,
  referenceFields,
  sendWebhook,
  STOREFRONT_URL,
  useIssuer,
  waitFor,
} from './shop-helpers';
import { createMpTestEnvironment, createStore, TestStore } from './test-env';

const { server, adminClient, shopClient, port, init } = createMpTestEnvironment(3103);
const mp = new MercadoPagoMock();
const events: MercadoPagoAttentionEvent[] = [];

let store: TestStore;
let otherStore: TestStore;
let payable: PayableStore;
let otherPayable: PayableStore;
let connections: MercadoPagoConnectionService;
let webhooks: MercadoPagoWebhookService;

const SELLER = 5001;
const OTHER_SELLER = 5002;
const grant: OAuthGrant = {
  access_token: 'APP_USR-store-token',
  refresh_token: 'TG-store-refresh',
  user_id: SELLER,
  expires_in: 15552000,
  scope: 'offline_access read write',
};
const otherGrant: OAuthGrant = {
  access_token: 'APP_USR-other-token',
  refresh_token: 'TG-other-refresh',
  user_id: OTHER_SELLER,
  expires_in: 15552000,
  scope: 'offline_access read write',
};

let nextPaymentId = 100;
/** Registers a payment on the mocked Mercado Pago, owned by the store's seller. */
function mpPayment(
  order: { code: string; totalWithTax: number },
  overrides: Partial<Parameters<typeof mp.addPayment>[0]> = {},
) {
  return mp.addPayment({
    id: ++nextPaymentId,
    status: 'approved',
    transaction_amount: order.totalWithTax / 100,
    currency_id: 'ARS',
    ...referenceFields(order),
    ownerToken: grant.access_token,
    collector_id: grant.user_id,
    ...overrides,
  });
}

/** Runs one notification synchronously, bypassing the queue, so assertions are deterministic. */
const process = (paymentId: number | string, userId: number | string | undefined = SELLER) =>
  webhooks.handle({
    kind: 'payment',
    mpPaymentId: String(paymentId),
    mpUserId: userId === undefined ? undefined : String(userId),
  });
const notify = (paymentId: number, options = {}) =>
  sendWebhook(port, { dataId: paymentId, userId: SELLER, ...options });
const orderOf = (code: string, forStore = store) => readOrder(adminClient, forStore, code);

const ADD_PAYMENT = gql`
  mutation ($input: PaymentInput!) {
    addPaymentToOrder(input: $input) {
      ... on Order {
        code
        state
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`;

beforeAll(async () => {
  mp.start();
  await init();
  useIssuer(server.app);
  connections = server.app.get(MercadoPagoConnectionService);
  webhooks = server.app.get(MercadoPagoWebhookService);
  server.app
    .get(EventBus)
    .ofType(MercadoPagoAttentionEvent)
    .subscribe((event) => events.push(event));
  store = await createStore(adminClient, 'pay-a', { storefrontUrl: STOREFRONT_URL });
  otherStore = await createStore(adminClient, 'pay-b', { storefrontUrl: STOREFRONT_URL });
  payable = await provisionStore(adminClient, store);
  otherPayable = await provisionStore(adminClient, otherStore);
  await connections.link(store.channelId, grant);
  await connections.link(otherStore.channelId, otherGrant);
}, 120_000);

afterAll(async () => {
  mp.stop();
  await server.destroy();
});

beforeEach(() => {
  events.length = 0;
  mp.requests = [];
});

describe('approved payment', () => {
  it('settles the order through the signed webhook and the queue, using the store token', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order);

    expect((await notify(payment.id)).status).toBe(200);

    const settled = await waitFor(
      () => orderOf(order.code),
      (o) => o.state === 'PaymentSettled',
    );
    expect(settled.payments).toEqual([
      expect.objectContaining({
        transactionId: String(payment.id),
        state: 'Settled',
        amount: order.totalWithTax,
      }),
    ]);
    // The notification only pointed at the payment: the truth came from GET /v1/payments/{id}.
    const lookups = mp.requestsTo('GET', `/v1/payments/${payment.id}`);
    expect(lookups.length).toBeGreaterThanOrEqual(1);
    expect(lookups.every((r) => r.authorization === `Bearer ${grant.access_token}`)).toBe(true);
  });

  it('does not trust the notification body: a payment Mercado Pago does not report as approved settles nothing', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order, { status: 'pending' });

    // The body of this notification claims "approved"; only the API answer counts.
    const response = await sendWebhook(port, { dataId: payment.id, userId: SELLER });
    expect(response.status).toBe(200);
    await process(payment.id);

    expect((await orderOf(order.code)).state).toBe('ArrangingPayment');
  });
});

describe('payments that do not settle (PRD 9.8)', () => {
  it('rejected: no payment is added, the order stays payable, and the buyer can retry', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order, {
      status: 'rejected',
      status_detail: 'cc_rejected_other_reason',
    });

    await process(payment.id);

    const after = await orderOf(order.code);
    expect(after.state).toBe('ArrangingPayment');
    expect(after.payments).toEqual([]);
    expect(notesOf(after)).toEqual([
      `Mercado Pago payment ${payment.id}: rejected (cc_rejected_other_reason).`,
    ]);

    // A second attempt with another payment settles the very same order.
    const retry = mpPayment(order);
    await process(retry.id);
    expect((await orderOf(order.code)).state).toBe('PaymentSettled');
  });

  it('cancelled and expired payments are handled like rejected ones', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order, { status: 'cancelled' });

    await process(payment.id);

    const after = await orderOf(order.code);
    expect(after.state).toBe('ArrangingPayment');
    expect(after.payments).toEqual([]);
  });

  it('records the same status once, however many notifications repeat it', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order, {
      status: 'pending',
      status_detail: 'pending_waiting_payment',
    });

    await process(payment.id);
    await process(payment.id);
    await process(payment.id);

    expect(notesOf(await orderOf(order.code))).toHaveLength(1);
  });

  it('pending: the order waits and settles when the payment is approved later (Rapipago, Pago Fácil)', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order, {
      status: 'pending',
      status_detail: 'pending_waiting_payment',
    });

    await process(payment.id);
    let after = await orderOf(order.code);
    expect(after.state).toBe('ArrangingPayment');
    expect(after.payments).toEqual([]);
    expect(notesOf(after)).toEqual([
      `Mercado Pago payment ${payment.id}: pending (pending_waiting_payment).`,
    ]);

    payment.status = 'approved'; // paid at the physical point
    await process(payment.id);

    after = await orderOf(order.code);
    expect(after.state).toBe('PaymentSettled');
    expect(after.payments).toHaveLength(1);
  });

  it('an unknown status never settles the order', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order, { status: 'brand_new_status' });

    await process(payment.id);

    expect((await orderOf(order.code)).state).toBe('ArrangingPayment');
  });
});

describe('idempotency (PRD 9.7)', () => {
  it('a duplicated webhook leaves exactly one payment', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order);

    await process(payment.id);
    await process(payment.id);
    await process(payment.id);

    const after = await orderOf(order.code);
    expect(after.state).toBe('PaymentSettled');
    expect(after.payments).toHaveLength(1);
  });

  it('duplicates delivered through the HTTP endpoint also leave one payment', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order);

    await Promise.all([notify(payment.id), notify(payment.id), notify(payment.id)]);

    await waitFor(
      () => orderOf(order.code),
      (o) => o.state === 'PaymentSettled',
    );
    await new Promise((resolve) => setTimeout(resolve, 500)); // let the duplicates drain
    expect((await orderOf(order.code)).payments).toHaveLength(1);
  });

  it('the webhook that arrives after the sync mutation changes nothing', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order);
    const { syncMercadoPagoPayment } = await shopClient.query(SYNC, {
      externalReference: issuedFor(order).externalReference,
      paymentId: String(payment.id),
    });
    expect(syncMercadoPagoPayment).toMatchObject({
      outcome: 'settled',
      orderState: 'PaymentSettled',
    });

    await process(payment.id);

    expect((await orderOf(order.code)).payments).toHaveLength(1);
  });

  it('the webhook that arrives before the buyer returns is reported as already settled by sync', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order);
    await process(payment.id);

    const { syncMercadoPagoPayment } = await shopClient.query(SYNC, {
      externalReference: issuedFor(order).externalReference,
      paymentId: String(payment.id),
    });

    expect(syncMercadoPagoPayment).toMatchObject({ outcome: 'already_settled' });
    expect((await orderOf(order.code)).payments).toHaveLength(1);
  });
});

describe('amount that does not match (PRD 9.8 edge case)', () => {
  it('does not add the payment, notes it and alerts the store once', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order, { transaction_amount: order.totalWithTax / 100 - 1 });

    await process(payment.id);
    await process(payment.id); // a repeated notification must not alert again

    const after = await orderOf(order.code);
    expect(after.state).toBe('ArrangingPayment');
    expect(after.payments).toEqual([]);
    expect(notesOf(after)).toHaveLength(1);
    expect(notesOf(after)[0]).toContain('does not match the order total');
    expect(events.map((e) => [e.reason, e.details.orderCode, e.details.mpPaymentId])).toEqual([
      ['amount_mismatch', order.code, String(payment.id)],
    ]);
  });

  it('flags a cart that grew while the buyer was paying', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order);
    await shopClient.query(BACK_TO_ADDING);
    await shopClient.query(ADD_ITEM, { id: payable.variantIds[1], q: 1 });
    await shopClient.query(TO_ARRANGING);

    await process(payment.id);

    const after = await orderOf(order.code);
    expect(after.payments).toEqual([]);
    expect(events.map((e) => e.reason)).toEqual(['amount_mismatch']);
  });

  it('flags approved money that arrives for an order that is no longer payable', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order);
    await shopClient.query(BACK_TO_ADDING);

    await process(payment.id);

    expect((await orderOf(order.code)).payments).toEqual([]);
    expect(events.map((e) => e.reason)).toEqual(['order_not_payable']);
  });

  it('flags a second approved payment for an order that already settled (refund needed)', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const first = mpPayment(order);
    const second = mpPayment(order);
    await process(first.id);
    events.length = 0;

    await process(second.id);

    const after = await orderOf(order.code);
    expect(after.payments.map((p) => p.transactionId)).toEqual([String(first.id)]);
    expect(events.map((e) => e.reason)).toEqual(['order_not_payable']);
  });
});

describe('payment later refunded on Mercado Pago', () => {
  it('records it and alerts the store without changing the order state automatically', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order);
    await process(payment.id);
    events.length = 0;

    payment.status = 'refunded';
    await process(payment.id);
    await process(payment.id);

    const after = await orderOf(order.code);
    expect(after.state).toBe('PaymentSettled');
    expect(after.payments).toHaveLength(1);
    expect(notesOf(after).filter((n) => n.includes('refunded'))).toHaveLength(1);
    expect(events.map((e) => e.reason)).toEqual(['payment_reversed']);
  });
});

describe('multi-tenancy', () => {
  it('ignores notifications for a seller that no store has linked', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order);

    await process(payment.id, 999_999);

    expect((await orderOf(order.code)).state).toBe('ArrangingPayment');
    expect(mp.requestsTo('GET', `/v1/payments/${payment.id}`)).toHaveLength(0);
  });

  it('never settles an order of one store with a payment owned by another store', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    // The payment exists in the OTHER seller's account and points at this store's order code.
    const foreign = mpPayment(order, {
      ownerToken: otherGrant.access_token,
      collector_id: otherGrant.user_id,
    });

    // Notification attributed to the other store's seller: looked up with the other store's token,
    // in the other store's channel, where that order code does not exist.
    await process(foreign.id, OTHER_SELLER);
    // Notification attributed to this store's seller: its own token cannot see the foreign payment.
    await process(foreign.id, SELLER);

    expect((await orderOf(order.code)).state).toBe('ArrangingPayment');
    expect((await orderOf(order.code)).payments).toEqual([]);
  });

  it('settles each store with its own seller account', async () => {
    const mine = await checkoutAsGuest(shopClient, store, payable);
    const theirs = await checkoutAsGuest(shopClient, otherStore, otherPayable);
    const myPayment = mpPayment(mine);
    const theirPayment = mpPayment(theirs, {
      ownerToken: otherGrant.access_token,
      collector_id: otherGrant.user_id,
    });

    await process(myPayment.id, SELLER);
    await process(theirPayment.id, OTHER_SELLER);

    expect((await orderOf(mine.code)).state).toBe('PaymentSettled');
    expect((await orderOf(theirs.code, otherStore)).state).toBe('PaymentSettled');
    const tokens = mp
      .requestsTo('GET', `/v1/payments/${theirPayment.id}`)
      .map((r) => r.authorization);
    // Looked up by the processor and re-verified by the handler, always with the owner's token.
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(new Set(tokens)).toEqual(new Set([`Bearer ${otherGrant.access_token}`]));
  });

  it('ignores a payment whose external_reference is not an order of that store', async () => {
    const payment = mpPayment({ code: 'NOT-AN-ORDER', totalWithTax: 1000 });

    await process(payment.id);

    expect(events).toEqual([]);
  });
});

describe('the storefront cannot settle an order by itself (PRD 9.5)', () => {
  /** The public mutation is refused before Mercado Pago is asked anything. */
  const refused = async (metadata: Record<string, unknown>) => {
    mp.requests = [];
    await expect(
      shopClient.query(ADD_PAYMENT, { input: { method: 'mercado-pago', metadata } }),
    ).rejects.toThrow(/payment processor/);
    expect(mp.requests).toHaveLength(0);
  };

  it('refuses addPaymentToOrder with an invented payment id', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);

    await refused({ mpPaymentId: '424242' });

    expect((await orderOf(order.code)).state).toBe('ArrangingPayment');
  });

  it('refuses a payment that is real but pending', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order, { status: 'pending' });

    await refused({ mpPaymentId: String(payment.id) });

    expect((await orderOf(order.code)).state).toBe('ArrangingPayment');
  });

  it('refuses a real, approved payment of the very order, without asking Mercado Pago', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order);

    await refused({ mpPaymentId: String(payment.id) });

    const after = await orderOf(order.code);
    expect(after.state).toBe('ArrangingPayment');
    expect(after.payments ?? []).toHaveLength(0);
  });

  it('refuses an approved payment that belongs to another order', async () => {
    const someoneElses = await checkoutAsGuest(
      shopClient,
      store,
      payable,
      [{ variantIndex: 1 }],
      'other@example.test',
    );
    const payment = mpPayment(someoneElses);
    // A different buyer, in a different session, tries to use that payment for their own order.
    const mine = await checkoutAsGuest(shopClient, store, payable);

    await refused({ mpPaymentId: String(payment.id) });

    expect((await orderOf(mine.code)).state).toBe('ArrangingPayment');
    expect((await orderOf(someoneElses.code)).state).toBe('ArrangingPayment');
  });

  it('refuses addPaymentToOrder without a payment id', async () => {
    await checkoutAsGuest(shopClient, store, payable);

    await refused({});
  });
});

describe('store disconnected or token expired (PRD 9.4, 12)', () => {
  const eligibility = gql`
    query {
      eligiblePaymentMethods {
        code
        isEligible
      }
    }
  `;

  afterEach(async () => {
    await connections.link(store.channelId, grant);
    mp.reset();
  });

  it('offers Mercado Pago while the account is linked and its token is valid', async () => {
    await checkoutAsGuest(shopClient, store, payable);

    const { eligiblePaymentMethods } = await shopClient.query(eligibility);

    expect(eligiblePaymentMethods).toEqual([{ code: 'mercado-pago', isEligible: true }]);
  });

  it('stops offering Mercado Pago once the store is disconnected, and processes nothing', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order);
    await connections.markDisconnected(
      (await connections.findActiveAccount(store.channelId))!.id,
      'revoked',
    );

    const { eligiblePaymentMethods } = await shopClient.query(eligibility);
    await process(payment.id);

    expect(eligiblePaymentMethods).toEqual([{ code: 'mercado-pago', isEligible: false }]);
    expect((await orderOf(order.code)).state).toBe('ArrangingPayment');
    expect(mp.requestsTo('GET', `/v1/payments/${payment.id}`)).toHaveLength(0);
  });

  it('renews an expired token on the spot and then settles', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order);
    await expireToken();
    mp.refreshGrants.set(grant.refresh_token, { ...grant, access_token: grant.access_token });

    await process(payment.id);

    expect((await orderOf(order.code)).state).toBe('PaymentSettled');
    expect(mp.requestsTo('POST', '/oauth/token')).toHaveLength(1);
  });

  it('with an expired token that cannot be renewed it settles nothing and is no longer offered', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order);
    await expireToken();

    await process(payment.id);
    const { eligiblePaymentMethods } = await shopClient.query(eligibility);

    expect((await orderOf(order.code)).state).toBe('ArrangingPayment');
    expect(eligiblePaymentMethods).toEqual([{ code: 'mercado-pago', isEligible: false }]);
  });
});

describe('malformed notifications', () => {
  it('ignores payment ids that are not plain numbers', async () => {
    for (const id of ['../../users/me', '12abc', '', '1; DROP TABLE', '9'.repeat(40)]) {
      await process(id);
    }
    expect(mp.requests).toHaveLength(0);
  });
});

async function expireToken() {
  const { TransactionalConnection } = await import('@vendure/core');
  const { MercadoPagoAccount } = await import('../src');
  await server.app
    .get(TransactionalConnection)
    .rawConnection.getRepository(MercadoPagoAccount)
    .update({ mpUserId: String(SELLER) }, { expiresAt: new Date(Date.now() - 1000) });
}

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
        message
      }
    }
  }
`;
const BACK_TO_ADDING = gql`
  mutation {
    transitionOrderToState(state: "AddingItems") {
      ... on Order {
        state
      }
    }
  }
`;
const TO_ARRANGING = gql`
  mutation {
    transitionOrderToState(state: "ArrangingPayment") {
      ... on Order {
        state
      }
    }
  }
`;
const ADD_ITEM = gql`
  mutation ($id: ID!, $q: Int!) {
    addItemToOrder(productVariantId: $id, quantity: $q) {
      ... on Order {
        totalWithTax
      }
    }
  }
`;

export type { CheckoutOrder };
