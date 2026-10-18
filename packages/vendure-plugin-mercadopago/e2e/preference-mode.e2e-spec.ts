import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import gql from 'graphql-tag';
import { MercadoPagoConnectionService } from '../src';
import { MercadoPagoMock, OAuthGrant } from './mp-mock';
import {
  BACK_URLS,
  checkoutAsGuest,
  PayableStore,
  provisionStore,
  readOrder,
  sendWebhook,
  STOREFRONT_URL,
  waitFor,
} from './shop-helpers';
import { createMpTestEnvironment, createStore, TestStore } from './test-env';

/**
 * Plan B for PRD V1/V2: no app-level webhook, each preference carries a `notification_url` with
 * the channel in the path. Signatures are optional there until sandbox shows whether those
 * notifications are signed (V2). The payment is always re-queried with the store token.
 */
const { server, adminClient, shopClient, port, init } = createMpTestEnvironment(3107, {
  webhookMode: 'preference',
  requireSignatureInPreferenceMode: false,
  preferenceItemsMode: 'total',
  allowInsecureReturnUrls: true,
});
const mp = new MercadoPagoMock();

let store: TestStore;
let payable: PayableStore;
let connections: MercadoPagoConnectionService;

const SELLER = 9101;
const grant: OAuthGrant = {
  access_token: 'APP_USR-pref-token',
  refresh_token: 'TG-pref-refresh',
  user_id: SELLER,
  expires_in: 15552000,
  scope: 'offline_access',
};

let nextId = 1800;
const payment = (order: { code: string; totalWithTax: number }) =>
  mp.addPayment({
    id: ++nextId,
    status: 'approved',
    transaction_amount: order.totalWithTax / 100,
    currency_id: 'ARS',
    external_reference: order.code,
    ownerToken: grant.access_token,
  });

const post = (path: string, query: Record<string, string>, body: unknown = {}) =>
  fetch(`http://localhost:${port}${path}?${new URLSearchParams(query)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  mp.start();
  await init();
  connections = server.app.get(MercadoPagoConnectionService);
  store = await createStore(adminClient, 'pm-a', { storefrontUrl: STOREFRONT_URL });
  payable = await provisionStore(adminClient, store, { shippingRate: 500 });
  await connections.link(store.channelId, grant);
}, 120_000);

afterAll(async () => {
  mp.stop();
  await server.destroy();
});

describe('webhookMode "preference"', () => {
  it('puts the channel token in the notification_url of every preference', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);

    await shopClient.query(
      gql`
        mutation ($input: MercadoPagoCheckoutInput!) {
          createMercadoPagoCheckout(input: $input) {
            __typename
          }
        }
      `,
      { input: { orderCode: order.code, ...BACK_URLS } },
    );

    const body = mp.requestsTo('POST', '/checkout/preferences').at(-1)!.body!;
    expect(body.notification_url).toBe(
      'https://platform.example.test/mercadopago/webhook/pm-a-token?source_news=webhooks',
    );
  });

  it('sends one line with the order total when configured for it (PRD V7 plan B)', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable, [
      { quantity: 2 },
      { variantIndex: 1 },
    ]);

    await shopClient.query(
      gql`
        mutation ($input: MercadoPagoCheckoutInput!) {
          createMercadoPagoCheckout(input: $input) {
            __typename
          }
        }
      `,
      { input: { orderCode: order.code, ...BACK_URLS } },
    );

    const items = mp.requestsTo('POST', '/checkout/preferences').at(-1)!.body!.items as {
      id: string;
      unit_price: number;
      quantity: number;
    }[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: order.code,
      quantity: 1,
      unit_price: order.totalWithTax / 100,
    });
  });

  it('settles from an unsigned, IPN-style notification on the channel route', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const approved = payment(order);

    const response = await post('/mercadopago/webhook/pm-a-token', {
      topic: 'payment',
      id: String(approved.id),
    });

    expect(response.status).toBe(200);
    const settled = await waitFor(
      () => readOrder(adminClient, store, order.code),
      (o) => o.state === 'PaymentSettled',
    );
    expect(settled.payments).toHaveLength(1);
    // Even unsigned, the payment was fetched with the store token.
    expect(mp.requestsTo('GET', `/v1/payments/${approved.id}`)[0]!.authorization).toBe(
      `Bearer ${grant.access_token}`,
    );
  });

  it('does not let an unsigned notification claim another seller', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const approved = payment(order);

    const response = await post(
      '/mercadopago/webhook/pm-a-token',
      { type: 'payment', 'data.id': String(approved.id) },
      { type: 'payment', user_id: 123456, data: { id: String(approved.id) } },
    );
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(response.status).toBe(200);
    expect((await readOrder(adminClient, store, order.code)).state).toBe('ArrangingPayment');
  });

  it('answers 404 for an unknown channel token', async () => {
    const response = await post('/mercadopago/webhook/no-such-channel', {
      topic: 'payment',
      id: '1',
    });

    expect(response.status).toBe(404);
  });

  it('keeps requiring a signature on the app-level route', async () => {
    const unsigned = await post('/mercadopago/webhook', { type: 'payment', 'data.id': '1' });
    const signed = await sendWebhook(port, { dataId: 1, userId: SELLER, type: 'merchant_order' });

    expect(unsigned.status).toBe(401);
    expect(signed.status).toBe(200);
  });
});

describe('allowInsecureReturnUrls (tests and local demos only)', () => {
  const LOCAL = 'http://localhost:3301';
  let localStore: TestStore;
  let localPayable: PayableStore;

  beforeAll(async () => {
    localStore = await createStore(adminClient, 'pm-local', { storefrontUrl: LOCAL });
    localPayable = await provisionStore(adminClient, localStore);
    await connections.link(localStore.channelId, {
      ...grant,
      access_token: 'APP_USR-pref-local',
      refresh_token: 'TG-pref-local',
      user_id: 9102,
    });
  }, 60_000);

  const create = (orderCode: string, successUrl: string) =>
    shopClient
      .query(
        gql`
          mutation ($input: MercadoPagoCheckoutInput!) {
            createMercadoPagoCheckout(input: $input) {
              __typename
              ... on MercadoPagoError {
                reason
              }
            }
          }
        `,
        {
          input: {
            orderCode,
            successUrl,
            failureUrl: `${LOCAL}/result`,
            pendingUrl: `${LOCAL}/result`,
          },
        },
      )
      .then((r) => r.createMercadoPagoCheckout);

  it('accepts local http return URLs on the store origin', async () => {
    const order = await checkoutAsGuest(shopClient, localStore, localPayable);

    expect(await create(order.code, `${LOCAL}/checkout/result`)).toEqual({
      __typename: 'MercadoPagoCheckout',
    });
  });

  it('still refuses any other origin', async () => {
    const order = await checkoutAsGuest(shopClient, localStore, localPayable);

    expect(await create(order.code, 'https://evil.example.test/result')).toMatchObject({
      reason: 'INVALID_BACK_URL',
    });
  });
});
