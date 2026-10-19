import { EventBus, Logger, TransactionalConnection } from '@vendure/core';
import gql from 'graphql-tag';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MercadoPagoAccount,
  MercadoPagoAttentionEvent,
  MercadoPagoChannelLink,
  MercadoPagoConnectionService,
  MercadoPagoPreference,
} from '../src';
import { MercadoPagoPaymentClaim } from '../src/entities/mercadopago-payment-claim.entity';
import { MercadoPagoPaymentProcessor } from '../src/services/payment-processor.service';
import { MercadoPagoMock, MockPayment, OAuthGrant } from './mp-mock';
import {
  BACK_URLS,
  checkoutAsGuest,
  issuedFor,
  notesOf,
  PayableStore,
  provisionStore,
  readOrder,
  referenceFields,
  STOREFRONT_URL,
  useIssuer,
} from './shop-helpers';
import { asSuperAdmin, createMpTestEnvironment, createStore, TestStore } from './test-env';

const { server, adminClient, shopClient, init } = createMpTestEnvironment(3109);
const mp = new MercadoPagoMock();

let storeA: TestStore;
let storeB: TestStore;
let payableA: PayableStore;
let payableB: PayableStore;
let connections: MercadoPagoConnectionService;
let processor: MercadoPagoPaymentProcessor;
const events: MercadoPagoAttentionEvent[] = [];

const X = 9101;
const Y = 9102;
const grantOf = (userId: number): OAuthGrant => ({
  access_token: `APP_USR-links-${userId}`,
  refresh_token: `TG-links-${userId}`,
  user_id: userId,
  expires_in: 15552000,
  scope: 'offline_access',
});
const gx = grantOf(X);
const gy = grantOf(Y);

const accounts = () =>
  server.app.get(TransactionalConnection).rawConnection.getRepository(MercadoPagoAccount);
const links = () =>
  server.app.get(TransactionalConnection).rawConnection.getRepository(MercadoPagoChannelLink);
const preferences = () =>
  server.app.get(TransactionalConnection).rawConnection.getRepository(MercadoPagoPreference);
const claims = () =>
  server.app.get(TransactionalConnection).rawConnection.getRepository(MercadoPagoPaymentClaim);

let nextId = 5000;
/** A payment collected by `grant`'s account for an order (approved unless told otherwise). */
function pay(
  order: { code: string; totalWithTax: number },
  grant: OAuthGrant,
  overrides: Partial<MockPayment> = {},
) {
  return mp.addPayment({
    id: ++nextId,
    status: 'approved',
    transaction_amount: order.totalWithTax / 100,
    currency_id: 'ARS',
    ...referenceFields(order),
    ownerToken: grant.access_token,
    collector_id: grant.user_id,
    ...overrides,
  });
}

/** What the application-level webhook does with a notification of the seller `userId`. */
const notify = (payment: { id: number }, userId: number) =>
  processor.process({ mpPaymentId: String(payment.id), mpUserId: String(userId) });

const stateOf = async (store: TestStore, code: string) =>
  (await readOrder(adminClient, store, code)).state;
const authOf = (request: { authorization: string | null }) => request.authorization;

const CREATE = gql`
  mutation ($input: MercadoPagoCheckoutInput!) {
    createMercadoPagoCheckout(input: $input) {
      __typename
      ... on MercadoPagoCheckout {
        preferenceId
      }
      ... on MercadoPagoError {
        reason
      }
    }
  }
`;
const createPreference = (orderCode: string) =>
  shopClient
    .query(CREATE, { input: { orderCode, ...BACK_URLS } })
    .then((r) => r.createMercadoPagoCheckout);
const lastPreference = () => mp.requestsTo('POST', '/checkout/preferences').at(-1)!;

const SYNC = gql`
  mutation ($externalReference: String!, $paymentId: String!) {
    syncMercadoPagoPayment(externalReference: $externalReference, paymentId: $paymentId) {
      __typename
      ... on MercadoPagoPaymentSync {
        outcome
      }
      ... on MercadoPagoError {
        reason
      }
    }
  }
`;
const ADD_PAYMENT = gql`
  mutation ($input: PaymentInput!) {
    addPaymentToOrder(input: $input) {
      __typename
      ... on Order {
        state
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`;

const REFUND = gql`
  mutation ($input: RefundOrderInput!) {
    refundOrder(input: $input) {
      __typename
      ... on Refund {
        state
        metadata
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`;

/** Refunds the whole order as the administrator of `store`. */
async function refundWhole(store: TestStore, code: string) {
  const found = await readOrder(adminClient, store, code);
  const { order } = await adminClient.query<{
    order: { lines: { id: string; quantity: number }[] };
  }>(
    gql`
      query ($id: ID!) {
        order(id: $id) {
          lines {
            id
            quantity
          }
        }
      }
    `,
    { id: found.id },
  );
  const { refundOrder } = await adminClient.query(REFUND, {
    input: {
      lines: order.lines.map((line) => ({ orderLineId: line.id, quantity: line.quantity })),
      shipping: 0,
      adjustment: 0,
      reason: 'Customer request',
      paymentId: found.payments[0]!.id,
    },
  });
  return refundOrder;
}

const reasons = () => events.map((e) => e.reason);
const statuses = async (store: TestStore) =>
  Object.fromEntries(
    (await connections.listLinks(store.channelId)).map((l) => [l.account.mpUserId, l.status]),
  );

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
  storeA = await createStore(adminClient, 'al-a', { storefrontUrl: STOREFRONT_URL });
  storeB = await createStore(adminClient, 'al-b', { storefrontUrl: STOREFRONT_URL });
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
  // Preferences point at accounts and links, so they go first.
  await preferences().createQueryBuilder().delete().execute();
  await links().createQueryBuilder().delete().execute();
  await accounts().createQueryBuilder().delete().execute();
});

describe('a store that changes account (X to Y)', () => {
  it('keeps refunding, settling late payments and honouring open preferences of the old account', async () => {
    await connections.link(storeA.channelId, gx);

    // Sold and settled with X: refunded after the change.
    const sold = await checkoutAsGuest(shopClient, storeA, payableA, [{}, { variantIndex: 1 }]);
    expect(await notify(pay(sold, gx), X)).toMatchObject({ outcome: 'settled' });
    // The buyer left with a voucher (Rapipago, Pago Fácil): pending when the store changes account.
    const voucher = await checkoutAsGuest(shopClient, storeA, payableA);
    const voucherPayment = pay(voucher, gx, { status: 'pending' });
    expect(await notify(voucherPayment, X)).toMatchObject({ outcome: 'pending' });
    // A preference created with X that the buyer pays after the change.
    const inFlight = await checkoutAsGuest(shopClient, storeA, payableA);
    expect((await createPreference(inFlight.code)).__typename).toBe('MercadoPagoCheckout');
    expect(authOf(lastPreference())).toBe(`Bearer ${gx.access_token}`);

    await connections.link(storeA.channelId, gy);

    // New preferences are created with Y.
    const fresh = await checkoutAsGuest(shopClient, storeA, payableA);
    await createPreference(fresh.code);
    expect(authOf(lastPreference())).toBe(`Bearer ${gy.access_token}`);

    // The refund of a payment collected by X works, with X's token.
    mp.requests = [];
    const refund = await refundWhole(storeA, sold.code);
    expect(refund).toMatchObject({ __typename: 'Refund', state: 'Settled' });
    expect(
      mp.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/refunds')),
    ).toHaveLength(1);
    expect(authOf(mp.requests.find((r) => r.path.endsWith('/refunds'))!)).toBe(
      `Bearer ${gx.access_token}`,
    );

    // The voucher is paid after the change: its order settles.
    voucherPayment.status = 'approved';
    expect(await notify(voucherPayment, X)).toMatchObject({ outcome: 'settled' });
    expect(await stateOf(storeA, voucher.code)).toBe('PaymentSettled');

    // So does the order of the preference created with X.
    expect(await notify(pay(inFlight, gx), X)).toMatchObject({ outcome: 'settled' });
    expect(await stateOf(storeA, inFlight.code)).toBe('PaymentSettled');
  });

  it('keeps processing pending payments after the store unlinks, while it stops offering Mercado Pago', async () => {
    await connections.link(storeA.channelId, gx);
    const voucher = await checkoutAsGuest(shopClient, storeA, payableA);
    const voucherPayment = pay(voucher, gx, { status: 'pending' });
    await notify(voucherPayment, X);

    await connections.retire(storeA.channelId);

    // New buyers are no longer offered Mercado Pago.
    await checkoutAsGuest(shopClient, storeA, payableA);
    const { eligiblePaymentMethods } = await shopClient.query(gql`
      query {
        eligiblePaymentMethods {
          code
          isEligible
        }
      }
    `);
    expect(eligiblePaymentMethods).toEqual([{ code: 'mercado-pago', isEligible: false }]);
    // But the voucher that was already issued still settles its order.
    voucherPayment.status = 'approved';
    expect(await notify(voucherPayment, X)).toMatchObject({ outcome: 'settled' });
    expect(await stateOf(storeA, voucher.code)).toBe('PaymentSettled');
  });

  it('reads a payment with the account of its preference, never trying the others', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await checkoutAsGuest(shopClient, storeA, payableA); // issued with X
    await connections.link(storeA.channelId, gy); // the store changes account
    const payment = pay(order, gx);

    // The sync mutation holds the reference: the registry names the account, nobody guesses it.
    const result = await processor.process({
      mpPaymentId: String(payment.id),
      externalReference: issuedFor(order).externalReference,
    });

    expect(result).toMatchObject({ outcome: 'settled', orderCode: order.code });
    const tokens = new Set(
      mp.requestsTo('GET', `/v1/payments/${payment.id}`).map((r) => authOf(r)),
    );
    expect(tokens).toEqual(new Set([`Bearer ${gx.access_token}`]));
  });
});

describe('an account that moves between stores (X retired in A, then linked in B)', () => {
  it('assigns each payment to the store its order belongs to', async () => {
    await connections.link(storeA.channelId, gx);
    const soldInA = await checkoutAsGuest(shopClient, storeA, payableA);
    const paymentA = pay(soldInA, gx);
    expect(await notify(paymentA, X)).toMatchObject({ outcome: 'settled' });

    await connections.retire(storeA.channelId);
    await connections.link(storeB.channelId, gx);

    // A sale of B, with the same account.
    const soldInB = await checkoutAsGuest(shopClient, storeB, payableB);
    expect(await notify(pay(soldInB, gx), X)).toMatchObject({
      outcome: 'settled',
      orderCode: soldInB.code,
    });
    expect(await stateOf(storeB, soldInB.code)).toBe('PaymentSettled');

    // A refund of a sale of A still works, as A's administrator.
    mp.requests = [];
    expect(await refundWhole(storeA, soldInA.code)).toMatchObject({ state: 'Settled' });
    expect(authOf(mp.requests.find((r) => r.path.endsWith('/refunds'))!)).toBe(
      `Bearer ${gx.access_token}`,
    );

    // A chargeback of a sale of A is assigned to A, not to the store that sells with X today.
    events.length = 0;
    paymentA.status = 'charged_back';
    expect(await notify(paymentA, X)).toMatchObject({
      outcome: 'reversed',
      orderCode: soldInA.code,
    });
    expect(events.map((e) => [e.reason, e.channelId, e.details.orderCode])).toEqual([
      ['payment_reversed', storeA.channelId, soldInA.code],
    ]);
    expect(notesOf(await readOrder(adminClient, storeA, soldInA.code)).join('\n')).toContain(
      'charged_back',
    );
    // B's order is untouched by it.
    expect(await stateOf(storeB, soldInB.code)).toBe('PaymentSettled');
  });

  it('ignores a payment whose order belongs to a store that never used the account', async () => {
    await connections.link(storeA.channelId, gx);
    const orderOfB = await checkoutAsGuest(shopClient, storeB, payableB);
    const payment = pay(orderOfB, gx);

    expect(await notify(payment, X)).toEqual({ outcome: 'ignored', reason: 'seller_mismatch' });

    expect(await stateOf(storeB, orderOfB.code)).toBe('ArrangingPayment');
    expect(await claims().findOneBy({ mpPaymentId: String(payment.id) })).toBeNull();
  });

  it('ignores a payment whose reference is no order of any store', async () => {
    await connections.link(storeA.channelId, gx);
    const payment = pay({ code: 'NOT-AN-ORDER', totalWithTax: 1000 }, gx);

    expect(await notify(payment, X)).toEqual({ outcome: 'ignored', reason: 'order_not_found' });
  });
});

describe('an approved payment for a released link', () => {
  async function releasedLinkOfA() {
    await connections.link(storeA.channelId, gx);
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    await connections.retire(storeA.channelId);
    await links().update(
      { channelId: storeA.channelId },
      { status: 'released', releasedAt: new Date() },
    );
    return order;
  }

  it('settles it when the account still has tokens, and tells the platform the release rule failed', async () => {
    const order = await releasedLinkOfA();
    await connections.link(storeB.channelId, gx); // X still works, for store B
    const payment = pay(order, gx);

    expect(await notify(payment, X)).toMatchObject({ outcome: 'settled', orderCode: order.code });

    expect(await stateOf(storeA, order.code)).toBe('PaymentSettled');
    expect(events.map((e) => [e.reason, e.channelId])).toEqual([
      ['released_link_payment', storeA.channelId],
    ]);
  });

  it('cannot verify it when the account has no tokens left, so it tells the platform and settles nothing', async () => {
    const order = await releasedLinkOfA();
    await accounts().update(
      { mpUserId: String(X) },
      { status: 'released', accessToken: '', refreshToken: '' },
    );
    const payment = pay(order, gx);

    expect(await notify(payment, X)).toEqual({ outcome: 'ignored', reason: 'not_connected' });

    expect(await stateOf(storeA, order.code)).toBe('ArrangingPayment');
    expect(mp.requestsTo('GET', `/v1/payments/${payment.id}`)).toHaveLength(0);
    expect(events.map((e) => [e.reason, e.channelId])).toEqual([['unverifiable_payment', null]]);
    expect(events[0]!.details).toMatchObject({
      mpPaymentId: String(payment.id),
      mpUserId: String(X),
    });
  });

  it('tells the platform about a notification for an account nobody knows', async () => {
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    const payment = pay(order, gx);

    expect(await notify(payment, 424242)).toEqual({ outcome: 'ignored', reason: 'unknown_seller' });

    expect(events.map((e) => [e.reason, e.channelId])).toEqual([['unverifiable_payment', null]]);
  });
});

describe('a pending payment of an account whose access was revoked (PRD 9.4)', () => {
  it('cannot be verified while the account has no tokens: the platform is told and nothing settles', async () => {
    await connections.link(storeA.channelId, gx);
    const voucher = await checkoutAsGuest(shopClient, storeA, payableA);
    const voucherPayment = pay(voucher, gx, { status: 'pending' });
    expect(await notify(voucherPayment, X)).toMatchObject({ outcome: 'pending' });
    expect(await connections.reconcileAfterConnectNotification(String(X))).toBe('disconnected');
    events.length = 0;
    voucherPayment.status = 'approved';

    expect(await notify(voucherPayment, X)).toEqual({
      outcome: 'ignored',
      reason: 'not_connected',
    });

    expect(await stateOf(storeA, voucher.code)).toBe('ArrangingPayment');
    expect(events.map((e) => [e.reason, e.channelId])).toEqual([['unverifiable_payment', null]]);
  });

  it('settles like any retired link once the holder authorizes the account again somewhere', async () => {
    await connections.link(storeA.channelId, gx);
    const voucher = await checkoutAsGuest(shopClient, storeA, payableA);
    const voucherPayment = pay(voucher, gx, { status: 'pending' });
    await notify(voucherPayment, X);
    await connections.reconcileAfterConnectNotification(String(X));
    await connections.link(storeB.channelId, gx); // the holder authorizes X again, in store B
    voucherPayment.status = 'approved';

    expect(await notify(voucherPayment, X)).toMatchObject({
      outcome: 'settled',
      orderCode: voucher.code,
    });

    expect(await stateOf(storeA, voucher.code)).toBe('PaymentSettled');
    expect(await statuses(storeA)).toEqual({ [X]: 'retired' });
  });
});

describe('the collector must be the account the payment was read with (PRD 9.7)', () => {
  const CASES = [
    {
      reason: 'collector_mismatch',
      // Mercado Pago answers X's token with a payment of Y, as it would for a forged reference.
      overrides: () => ({ ownerToken: gy.access_token, collector_id: Y, anyoneCanRead: true }),
    },
    { reason: 'collector_missing', overrides: () => ({ collector_id: null }) },
  ] as const;

  for (const { reason, overrides } of CASES) {
    describe(reason, () => {
      it('does not settle the webhook payment: the claim waits for review and everyone is told', async () => {
        await connections.link(storeA.channelId, gx);
        const order = await checkoutAsGuest(shopClient, storeA, payableA);
        const payment = pay(order, gx, overrides());

        expect(await notify(payment, X)).toEqual({
          outcome: 'needs_review',
          orderCode: order.code,
          orderState: 'ArrangingPayment',
          reason,
        });

        expect(await stateOf(storeA, order.code)).toBe('ArrangingPayment');
        const claim = await claims().findOneByOrFail({ mpPaymentId: String(payment.id) });
        expect(claim).toMatchObject({ status: 'needs_review', note: `${reason}:${X}` });
        expect(events.map((e) => [e.reason, e.channelId])).toEqual([[reason, storeA.channelId]]);
        expect(events[0]!.details).toMatchObject({
          orderCode: order.code,
          mpPaymentId: String(payment.id),
          mpUserId: String(X),
        });
        const notes = notesOf(await readOrder(adminClient, storeA, order.code)).join('\n');
        expect(notes).toContain(`Mercado Pago account ${X}`);
        // The collector Mercado Pago reported is kept as evidence (V19).
        if (reason === 'collector_mismatch') {
          expect(notes).toContain(`says account ${Y} collected it`);
        }

        // A repeated notification is not alerted twice.
        expect(await notify(payment, X)).toMatchObject({ outcome: 'needs_review', reason });
        expect(events).toHaveLength(1);
      });

      it('does not settle the payment through the sync mutation either', async () => {
        await connections.link(storeA.channelId, gx);
        const order = await checkoutAsGuest(shopClient, storeA, payableA);
        const payment = pay(order, gx, overrides());

        const { syncMercadoPagoPayment } = await shopClient.query(SYNC, {
          externalReference: issuedFor(order).externalReference,
          paymentId: String(payment.id),
        });

        expect(syncMercadoPagoPayment).toEqual({
          __typename: 'MercadoPagoPaymentSync',
          outcome: 'needs_review',
        });
        expect(await stateOf(storeA, order.code)).toBe('ArrangingPayment');
        expect(reasons()).toEqual([reason]);
      });

      it('does not let a buyer settle the order through addPaymentToOrder, and asks Mercado Pago nothing', async () => {
        await connections.link(storeA.channelId, gx);
        const order = await checkoutAsGuest(shopClient, storeA, payableA);
        const payment = pay(order, gx, overrides());
        mp.requests = [];

        await expect(
          shopClient.query(ADD_PAYMENT, {
            input: { method: 'mercado-pago', metadata: { mpPaymentId: String(payment.id) } },
          }),
        ).rejects.toThrow(/payment processor/);

        // Refused before anything else: no request, no claim, no review, nothing on the order.
        expect(mp.requests).toHaveLength(0);
        expect(await stateOf(storeA, order.code)).toBe('ArrangingPayment');
        expect(await claims().findOneBy({ mpPaymentId: String(payment.id) })).toBeNull();
        expect(reasons()).toEqual([]);
      });

      it('only refuses to settle: a pending payment with that problem is recorded as always', async () => {
        await connections.link(storeA.channelId, gx);
        const order = await checkoutAsGuest(shopClient, storeA, payableA);
        const payment = pay(order, gx, { ...overrides(), status: 'pending' });
        const warn = vi.spyOn(Logger, 'warn');

        expect(await notify(payment, X)).toMatchObject({ outcome: 'pending' });

        // The collector that was observed stays in the log: it is the evidence V19 relies on.
        expect(warn.mock.calls.map(([message]) => message)).toContainEqual(
          expect.stringContaining(`${reason} (read with account ${X}, collector_id`),
        );
        warn.mockRestore();
        expect(await stateOf(storeA, order.code)).toBe('ArrangingPayment');
        expect((await claims().findOneByOrFail({ mpPaymentId: String(payment.id) })).status).toBe(
          'recorded',
        );
        expect(events).toHaveLength(0);
      });

      it('never loses a chargeback alert because of that problem', async () => {
        await connections.link(storeA.channelId, gx);
        const order = await checkoutAsGuest(shopClient, storeA, payableA);
        const payment = pay(order, gx, { ...overrides(), status: 'charged_back' });

        expect(await notify(payment, X)).toMatchObject({ outcome: 'reversed' });

        expect(reasons()).toEqual(['payment_reversed']);
      });
    });
  }

  it('settles a payment whose collector is the account', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    const payment = pay(order, gx);

    expect(await notify(payment, X)).toMatchObject({ outcome: 'settled' });

    const settled = await readOrder(adminClient, storeA, order.code);
    expect(settled.payments).toHaveLength(1);
    await asSuperAdmin(adminClient);
    expect(events).toHaveLength(0);
  });

  it('stamps the settled payment with the account that read it and the collector Mercado Pago reported', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await checkoutAsGuest(shopClient, storeA, payableA);
    await notify(pay(order, gx), X);

    adminClient.setChannelToken(storeA.token);
    const found = await readOrder(adminClient, storeA, order.code);
    const { order: withMetadata } = await adminClient.query<{
      order: { payments: { metadata: Record<string, unknown> }[] };
    }>(
      gql`
        query ($id: ID!) {
          order(id: $id) {
            payments {
              metadata
            }
          }
        }
      `,
      { id: found.id },
    );
    expect(withMetadata.payments[0]!.metadata).toMatchObject({
      mpAccountUserId: String(X),
      mpCollectorId: X,
      public: { mpPaymentId: String(found.payments[0]!.transactionId) },
    });
  });
});
