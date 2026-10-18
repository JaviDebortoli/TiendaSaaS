import gql from 'graphql-tag';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MercadoPagoConnectionService } from '../src';
import { MercadoPagoMock, OAuthGrant } from './mp-mock';
import {
  BACK_URLS,
  checkoutAsGuest,
  PayableStore,
  provisionStore,
  readOrder,
  STOREFRONT_URL,
} from './shop-helpers';
import { createMpTestEnvironment, createStore, TestStore } from './test-env';

const { server, adminClient, shopClient, init } = createMpTestEnvironment(3105);
const mp = new MercadoPagoMock();

let store: TestStore;
let unconfiguredStore: TestStore;
let payable: PayableStore;
let unconfiguredPayable: PayableStore;
let connections: MercadoPagoConnectionService;

const SELLER = 7001;
const grant: OAuthGrant = {
  access_token: 'APP_USR-checkout-token',
  refresh_token: 'TG-checkout-refresh',
  user_id: SELLER,
  expires_in: 15552000,
  scope: 'offline_access',
};

const CREATE = gql`
  mutation ($input: MercadoPagoCheckoutInput!) {
    createMercadoPagoCheckout(input: $input) {
      __typename
      ... on MercadoPagoCheckout {
        preferenceId
        initPoint
        sandboxInitPoint
        expiresAt
      }
      ... on MercadoPagoError {
        errorCode
        reason
        message
      }
    }
  }
`;
const SYNC = gql`
  mutation ($orderCode: String!, $paymentId: String!) {
    syncMercadoPagoPayment(orderCode: $orderCode, paymentId: $paymentId) {
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

const create = (orderCode: string, urls = BACK_URLS) =>
  shopClient
    .query(CREATE, { input: { orderCode, ...urls } })
    .then((r) => r.createMercadoPagoCheckout);
const lastPreference = () => mp.requestsTo('POST', '/checkout/preferences').at(-1)!;

beforeAll(async () => {
  mp.start();
  await init();
  connections = server.app.get(MercadoPagoConnectionService);
  store = await createStore(adminClient, 'co-a', { storefrontUrl: STOREFRONT_URL });
  unconfiguredStore = await createStore(adminClient, 'co-b');
  // Shipping is 5.00 so the preference has a shipping line to add up.
  payable = await provisionStore(adminClient, store, { shippingRate: 500 });
  unconfiguredPayable = await provisionStore(adminClient, unconfiguredStore);
  await connections.link(store.channelId, grant);
  await connections.link(unconfiguredStore.channelId, {
    ...grant,
    access_token: 'APP_USR-co-b',
    refresh_token: 'TG-co-b',
    user_id: 7002,
  });
}, 120_000);

afterAll(async () => {
  mp.stop();
  await server.destroy();
});

beforeEach(() => mp.reset());

describe('createMercadoPagoCheckout (PRD 9.6 step 2)', () => {
  it('creates the preference with the store token and returns where to redirect the buyer', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable, [
      { quantity: 2 },
      { variantIndex: 1 },
    ]);

    const result = await create(order.code);

    expect(result.__typename).toBe('MercadoPagoCheckout');
    expect(result.initPoint).toBe(`https://mp.test/checkout/${result.preferenceId}`);
    const request = lastPreference();
    expect(request.authorization).toBe(`Bearer ${grant.access_token}`);
    expect(request.idempotencyKey).toBeTruthy();
    expect(request.body).toMatchObject({
      external_reference: order.code,
      auto_return: 'approved',
      back_urls: {
        success: BACK_URLS.successUrl,
        failure: BACK_URLS.failureUrl,
        pending: BACK_URLS.pendingUrl,
      },
      expires: true,
      payer: { email: 'buyer@example.test' },
      metadata: { channel_code: 'co-a', order_code: order.code },
    });
  });

  it('sends no notification_url: the app-level webhook is used (PRD 9.7)', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    await create(order.code);

    expect(lastPreference().body).not.toHaveProperty('notification_url');
  });

  it('adds up to exactly the order total, shipping included, in ARS with cents', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable, [
      { quantity: 3 },
      { variantIndex: 1, quantity: 2 },
    ]);
    await create(order.code);

    const items = lastPreference().body!.items as {
      unit_price: number;
      quantity: number;
      currency_id: string;
    }[];
    const cents = items.reduce((sum, i) => sum + Math.round(i.unit_price * 100) * i.quantity, 0);
    expect(cents).toBe(order.totalWithTax);
    expect(items.every((i) => i.currency_id === 'ARS')).toBe(true);
    expect(items.at(-1)).toMatchObject({ id: 'shipping', unit_price: 5 });
  });

  it('limits the validity of the preference (PRD 9.6)', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const result = await create(order.code);

    const body = lastPreference().body!;
    const from = Date.parse(String(body.expiration_date_from));
    const to = Date.parse(String(body.expiration_date_to));
    expect(to - from).toBe(30 * 60_000);
    expect(Date.parse(result.expiresAt)).toBe(to);
    expect(to).toBeGreaterThan(Date.now());
  });

  it('reuses the idempotency key for the same request and changes it when the request changes', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);

    await create(order.code);
    await create(order.code);
    await create(order.code, { ...BACK_URLS, successUrl: `${STOREFRONT_URL}/other` });

    const keys = mp.requestsTo('POST', '/checkout/preferences').map((r) => r.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('never exposes Mercado Pago credentials in the response', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const result = await create(order.code);

    const text = JSON.stringify(result);
    for (const secret of [grant.access_token, grant.refresh_token, 'test-client-secret']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('createMercadoPagoCheckout refusals', () => {
  it('only works for the order of the buyer own session', async () => {
    const someoneElses = await checkoutAsGuest(shopClient, store, payable);
    await checkoutAsGuest(shopClient, store, payable); // a new session replaces the previous one

    const result = await create(someoneElses.code);

    expect(result).toMatchObject({ __typename: 'MercadoPagoError', reason: 'ORDER_NOT_FOUND' });
    expect(mp.requests).toHaveLength(0);
  });

  it('requires the order to be in ArrangingPayment', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    await shopClient.query(gql`
      mutation {
        transitionOrderToState(state: "AddingItems") {
          ... on Order {
            state
          }
        }
      }
    `);

    expect(await create(order.code)).toMatchObject({ reason: 'ORDER_NOT_READY' });
  });

  it.each([
    ['another domain', 'https://evil.example.test/result'],
    ['a sub-domain of the store domain', 'https://evil.tienda.example.test/result'],
    ['plain http', 'http://tienda.example.test/result'],
    ['localhost', 'http://localhost:3000/result'],
    ['something that is not a URL', 'not a url'],
  ])('rejects a return URL on %s', async (_label, url) => {
    const order = await checkoutAsGuest(shopClient, store, payable);

    const result = await create(order.code, { ...BACK_URLS, failureUrl: url });

    expect(result).toMatchObject({ __typename: 'MercadoPagoError', reason: 'INVALID_BACK_URL' });
    expect(mp.requestsTo('POST', '/checkout/preferences')).toHaveLength(0);
  });

  it('refuses stores whose storefront URL has not been configured', async () => {
    const order = await checkoutAsGuest(shopClient, unconfiguredStore, unconfiguredPayable);

    expect(await create(order.code)).toMatchObject({ reason: 'STOREFRONT_NOT_CONFIGURED' });
  });

  describe('when the store is disconnected', () => {
    afterEach(() => connections.link(store.channelId, grant));

    it('refuses with a clear reason and calls nothing', async () => {
      const order = await checkoutAsGuest(shopClient, store, payable);
      await connections.markDisconnected(store.channelId, 'revoked');

      expect(await create(order.code)).toMatchObject({ reason: 'NOT_CONNECTED' });
      expect(mp.requests).toHaveLength(0);
    });
  });

  it('reports a Mercado Pago failure without leaking details', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    mp.preferenceStatus = 400;

    const result = await create(order.code);

    expect(result).toMatchObject({
      __typename: 'MercadoPagoError',
      reason: 'MERCADOPAGO_UNAVAILABLE',
    });
    expect(JSON.stringify(result)).not.toContain(grant.access_token);
  });
});

describe('syncMercadoPagoPayment (PRD 9.6 step 6)', () => {
  let nextId = 900;
  const payment = (order: { code: string; totalWithTax: number }, overrides = {}) =>
    mp.addPayment({
      id: ++nextId,
      status: 'approved',
      transaction_amount: order.totalWithTax / 100,
      currency_id: 'ARS',
      external_reference: order.code,
      ownerToken: grant.access_token,
      ...overrides,
    });
  const sync = (orderCode: string, paymentId: string | number) =>
    shopClient
      .query(SYNC, { orderCode, paymentId: String(paymentId) })
      .then((r) => r.syncMercadoPagoPayment);

  it('settles the order by asking Mercado Pago, not by believing the redirect', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const approved = payment(order);

    expect(await sync(order.code, approved.id)).toMatchObject({
      outcome: 'settled',
      orderState: 'PaymentSettled',
    });
    expect(mp.requestsTo('GET', `/v1/payments/${approved.id}`)[0]!.authorization).toBe(
      `Bearer ${grant.access_token}`,
    );
  });

  it('does not settle when the redirect said success but Mercado Pago says pending', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const pending = payment(order, { status: 'pending' });

    expect(await sync(order.code, pending.id)).toMatchObject({
      outcome: 'pending',
      orderState: 'ArrangingPayment',
    });
    expect((await readOrder(adminClient, store, order.code)).payments).toEqual([]);
  });

  it('does not settle an order with a payment that belongs to another order', async () => {
    const mine = await checkoutAsGuest(shopClient, store, payable);
    const theirs = { code: 'SOMEONE-ELSE', totalWithTax: mine.totalWithTax };
    const foreign = payment(theirs);

    expect(await sync(mine.code, foreign.id)).toMatchObject({
      __typename: 'MercadoPagoError',
      reason: 'ORDER_NOT_FOUND',
    });
    expect((await readOrder(adminClient, store, mine.code)).state).toBe('ArrangingPayment');
  });

  it('does not settle with a payment pointing at a real order other than the one named', async () => {
    const first = await checkoutAsGuest(shopClient, store, payable);
    const second = await checkoutAsGuest(shopClient, store, payable);
    const paymentOfFirst = payment(first);

    expect(await sync(second.code, paymentOfFirst.id)).toMatchObject({ reason: 'ORDER_MISMATCH' });
    expect((await readOrder(adminClient, store, first.code)).state).toBe('ArrangingPayment');
  });

  it.each([['999999'], ['abc'], ['../users/me']])(
    'answers a clear error for payment id %s',
    async (id) => {
      const order = await checkoutAsGuest(shopClient, store, payable);

      expect(await sync(order.code, id)).toMatchObject({
        __typename: 'MercadoPagoError',
        reason: 'PAYMENT_NOT_FOUND',
      });
    },
  );
});

describe('reading the order while it is being paid', () => {
  const ORDER_BY_CODE = gql`
    query ($code: String!) {
      orderByCode(code: $code) {
        code
        state
      }
    }
  `;

  it('lets the buyer session read its own order by code before it is placed', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);

    const { orderByCode } = await shopClient.query(ORDER_BY_CODE, { code: order.code });

    expect(orderByCode).toEqual({ code: order.code, state: 'ArrangingPayment' });
  });

  it('does not let another session read it', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    await shopClient.asAnonymousUser(); // a different buyer

    await expect(shopClient.query(ORDER_BY_CODE, { code: order.code })).rejects.toThrow(
      /not currently authorized/i,
    );
  });
});
