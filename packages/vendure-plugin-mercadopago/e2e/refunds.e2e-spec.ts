import gql from 'graphql-tag';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MercadoPagoConnectionService } from '../src';
import { MercadoPagoWebhookService } from '../src/services/webhook.service';
import { MercadoPagoMock, OAuthGrant } from './mp-mock';
import {
  checkoutAsGuest,
  notesOf,
  PayableStore,
  provisionStore,
  readOrder,
  STOREFRONT_URL,
} from './shop-helpers';
import {
  asStoreAdmin,
  asSuperAdmin,
  createMpTestEnvironment,
  createStore,
  TestStore,
} from './test-env';

const { server, adminClient, shopClient, init } = createMpTestEnvironment(3106);
const mp = new MercadoPagoMock();

let store: TestStore;
let otherStore: TestStore;
let readOnlyAdmin: TestStore;
let payable: PayableStore;
let otherPayable: PayableStore;
let connections: MercadoPagoConnectionService;
let webhooks: MercadoPagoWebhookService;

const SELLER = 8001;
const grant: OAuthGrant = {
  access_token: 'APP_USR-refund-token',
  refresh_token: 'TG-refund-refresh',
  user_id: SELLER,
  expires_in: 15552000,
  scope: 'offline_access',
};
const otherGrant: OAuthGrant = {
  access_token: 'APP_USR-refund-other',
  refresh_token: 'TG-refund-other',
  user_id: 8002,
  expires_in: 15552000,
  scope: 'offline_access',
};

let nextId = 1200;
function mpPayment(order: { code: string; totalWithTax: number }, overrides = {}) {
  return mp.addPayment({
    id: ++nextId,
    status: 'approved',
    transaction_amount: order.totalWithTax / 100,
    currency_id: 'ARS',
    external_reference: order.code,
    ownerToken: grant.access_token,
    ...overrides,
  });
}

/** A settled order with two lines (one unit of each product), as the webhook would leave it. */
async function settledOrder() {
  const order = await checkoutAsGuest(shopClient, store, payable, [
    { variantIndex: 0 },
    { variantIndex: 1 },
  ]);
  const payment = mpPayment(order);
  await webhooks.handle({
    kind: 'payment',
    mpPaymentId: String(payment.id),
    mpUserId: String(SELLER),
  });
  return { order, payment };
}

async function orderDetail(code: string) {
  await asSuperAdmin(adminClient);
  adminClient.setChannelToken(store.token);
  const found = await readOrder(adminClient, store, code);
  const { order } = await adminClient.query<{
    order: {
      lines: { id: string; quantity: number; proratedLinePriceWithTax: number }[];
      payments: { id: string }[];
    };
  }>(
    gql`
      query ($id: ID!) {
        order(id: $id) {
          lines {
            id
            quantity
            proratedLinePriceWithTax
          }
          payments {
            id
          }
        }
      }
    `,
    { id: found.id },
  );
  return order;
}

const REFUND = gql`
  mutation ($input: RefundOrderInput!) {
    refundOrder(input: $input) {
      __typename
      ... on Refund {
        id
        state
        total
        transactionId
        metadata
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`;

async function refund(code: string, lineIndexes: number[]) {
  const detail = await orderDetail(code);
  const { refundOrder } = await adminClient.query(REFUND, {
    input: {
      lines: lineIndexes.map((i) => ({ orderLineId: detail.lines[i]!.id, quantity: 1 })),
      shipping: 0,
      adjustment: 0,
      reason: 'Customer request',
      paymentId: detail.payments[0]!.id,
    },
  });
  return { refundOrder, detail };
}

beforeAll(async () => {
  mp.start();
  await init();
  connections = server.app.get(MercadoPagoConnectionService);
  webhooks = server.app.get(MercadoPagoWebhookService);
  store = await createStore(adminClient, 'rf-a', { storefrontUrl: STOREFRONT_URL });
  otherStore = await createStore(adminClient, 'rf-b', { storefrontUrl: STOREFRONT_URL });
  readOnlyAdmin = await createStore(adminClient, 'rf-c', { permissions: ['ReadOrder'] });
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
  mp.requests = [];
  mp.refundError = undefined;
});

describe('refunds (PRD 9.9)', () => {
  it('refunds the whole payment with an empty body and the store token', async () => {
    const { order, payment } = await settledOrder();

    const { refundOrder } = await refund(order.code, [0, 1]);

    expect(refundOrder).toMatchObject({
      __typename: 'Refund',
      state: 'Settled',
      total: order.totalWithTax,
    });
    const [request] = mp.requestsTo('POST', `/v1/payments/${payment.id}/refunds`);
    expect(request!.authorization).toBe(`Bearer ${grant.access_token}`);
    expect(request!.body).toEqual({});
    expect(request!.idempotencyKey).toBeTruthy();
    expect(refundOrder.transactionId).toMatch(/^9\d+$/);
    expect(mp.payments.get(payment.id)!.transaction_amount_refunded).toBe(order.totalWithTax / 100);
  });

  it('refunds a part of the payment with the exact amount, cents included', async () => {
    const { order, payment } = await settledOrder();
    const detail = await orderDetail(order.code);
    const first = detail.lines[0]!.proratedLinePriceWithTax;

    const { refundOrder } = await refund(order.code, [0]);

    expect(refundOrder).toMatchObject({ state: 'Settled', total: first });
    const [request] = mp.requestsTo('POST', `/v1/payments/${payment.id}/refunds`);
    expect(request!.body).toEqual({ amount: first / 100 });
  });

  it('shows a clear failure when the seller has no balance, and records no settled refund', async () => {
    const { order, payment } = await settledOrder();
    mp.refundError = 'Not enough balance in the seller account to refund this payment';

    const { refundOrder } = await refund(order.code, [0, 1]);

    expect(refundOrder.state).toBe('Failed');
    expect(String(refundOrder.metadata.errorMessage)).toContain('Not enough balance');
    expect(mp.payments.get(payment.id)!.transaction_amount_refunded).toBeUndefined();
  });

  describe('when the store is disconnected', () => {
    afterEach(() => connections.link(store.channelId, grant));

    it('fails with a message the owner can act on', async () => {
      const { order } = await settledOrder();
      await connections.markDisconnected(store.channelId, 'revoked');

      const { refundOrder } = await refund(order.code, [0, 1]);

      expect(refundOrder.state).toBe('Failed');
      expect(String(refundOrder.metadata.errorMessage)).toMatch(/not connected/i);
    });
  });
});

describe('cancelMercadoPagoPayment (PRD 9.9)', () => {
  const CANCEL = gql`
    mutation ($paymentId: String!) {
      cancelMercadoPagoPayment(paymentId: $paymentId)
    }
  `;

  async function pendingPayment() {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const payment = mpPayment(order, { status: 'pending' });
    return { order, payment };
  }

  it('cancels a pending payment on Mercado Pago and leaves a note on the order', async () => {
    const { order, payment } = await pendingPayment();
    await asStoreAdmin(adminClient, store);

    const { cancelMercadoPagoPayment } = await adminClient.query(CANCEL, {
      paymentId: String(payment.id),
    });

    expect(cancelMercadoPagoPayment).toBe(true);
    expect(mp.payments.get(payment.id)!.status).toBe('cancelled');
    expect(mp.requestsTo('PUT', `/v1/payments/${payment.id}`)[0]!.authorization).toBe(
      `Bearer ${grant.access_token}`,
    );
    expect(notesOf(await readOrder(adminClient, store, order.code))).toContain(
      `Mercado Pago payment ${payment.id} was cancelled.`,
    );
  });

  it('refuses to cancel an approved payment', async () => {
    const { payment } = await settledOrder();
    await asStoreAdmin(adminClient, store);

    await expect(adminClient.query(CANCEL, { paymentId: String(payment.id) })).rejects.toThrow(
      /Only pending or in-process/,
    );
    expect(mp.payments.get(payment.id)!.status).toBe('approved');
  });

  it('refuses a payment that belongs to another store', async () => {
    const order = await checkoutAsGuest(shopClient, otherStore, otherPayable);
    const foreign = mpPayment(order, { status: 'pending', ownerToken: otherGrant.access_token });
    await asStoreAdmin(adminClient, store);

    await expect(adminClient.query(CANCEL, { paymentId: String(foreign.id) })).rejects.toThrow(
      /not found/i,
    );
    expect(mp.payments.get(foreign.id)!.status).toBe('pending');
  });

  it.each([['abc'], ['../users/me']])('rejects the invalid payment id %s', async (paymentId) => {
    await asStoreAdmin(adminClient, store);

    await expect(adminClient.query(CANCEL, { paymentId })).rejects.toThrow(/Invalid payment id/);
  });

  it('needs permission to update orders', async () => {
    const { payment } = await pendingPayment();
    await asStoreAdmin(adminClient, readOnlyAdmin);

    await expect(adminClient.query(CANCEL, { paymentId: String(payment.id) })).rejects.toThrow(
      /not currently authorized/i,
    );
  });
});
