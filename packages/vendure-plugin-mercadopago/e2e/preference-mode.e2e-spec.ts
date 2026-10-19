import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import gql from 'graphql-tag';
import { MercadoPagoConnectionService, MercadoPagoPreferenceRegistry } from '../src';
import { MercadoPagoMock, OAuthGrant } from './mp-mock';
import {
  BACK_URLS,
  checkoutAsGuest,
  issuedFor,
  issuePreference,
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
    ...referenceFields(order),
    ownerToken: grant.access_token,
    collector_id: grant.user_id,
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
  useIssuer(server.app);
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
    // The URL carries the store and the identifier of this very preference: that is how the
    // account that reads its payments is found without trying any.
    const entry = (await server.app
      .get(MercadoPagoPreferenceRegistry)
      .findByExternalReference(String(body.external_reference)))!;
    expect(entry.orderCode).toBe(order.code);
    expect(body.notification_url).toBe(
      `https://platform.example.test/mercadopago/webhook/pm-a-token?source_news=webhooks&ref=${entry.token}`,
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
      ref: issuedFor(order).token,
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

  it('ignores a notification whose identifier is not a registry one, asking Mercado Pago nothing', async () => {
    const order = await checkoutAsGuest(shopClient, store, payable);
    const approved = payment(order);
    mp.requests = [];

    for (const ref of ['not-a-token', 'A'.repeat(22), "' OR 1=1 --", 'x'.repeat(500)]) {
      const response = await post('/mercadopago/webhook/pm-a-token', {
        topic: 'payment',
        id: String(approved.id),
        ref,
      });
      expect(response.status).toBe(200);
    }
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(mp.requestsTo('GET', `/v1/payments/${approved.id}`)).toHaveLength(0);
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

describe('webhookMode "preference" with several accounts (PRD 9.7)', () => {
  let changed: TestStore;
  let changedPayable: PayableStore;
  let other: TestStore;
  let otherPayable: PayableStore;
  const OLD = 9104;
  const NEW = 9105;
  const grantOf = (userId: number): OAuthGrant => ({
    ...grant,
    access_token: `APP_USR-pref-${userId}`,
    refresh_token: `TG-pref-${userId}`,
    user_id: userId,
  });
  const forAccount = (
    order: { code: string; totalWithTax: number },
    accountGrant: OAuthGrant,
    overrides = {},
  ) =>
    mp.addPayment({
      id: ++nextId,
      status: 'approved',
      transaction_amount: order.totalWithTax / 100,
      currency_id: 'ARS',
      ...referenceFields(order),
      ownerToken: accountGrant.access_token,
      collector_id: accountGrant.user_id,
      ...overrides,
    });

  beforeAll(async () => {
    changed = await createStore(adminClient, 'pm-change', { storefrontUrl: STOREFRONT_URL });
    changedPayable = await provisionStore(adminClient, changed);
    other = await createStore(adminClient, 'pm-other', { storefrontUrl: STOREFRONT_URL });
    otherPayable = await provisionStore(adminClient, other);
    await connections.link(changed.channelId, grantOf(OLD));
    await connections.link(changed.channelId, grantOf(NEW)); // OLD is retired
    await connections.link(other.channelId, grantOf(9106));
  }, 60_000);

  it('settles a payment of the account the store retired, on the route of the store', async () => {
    const order = await checkoutAsGuest(shopClient, changed, changedPayable);
    // The order was placed while the store still sold with the old account.
    await issuePreference(server.app, order, { mpUserId: String(OLD) });
    const approved = forAccount(order, grantOf(OLD));

    const response = await post('/mercadopago/webhook/pm-change-token', {
      topic: 'payment',
      id: String(approved.id),
      ref: issuedFor(order).token,
    });

    expect(response.status).toBe(200);
    const settled = await waitFor(
      () => readOrder(adminClient, changed, order.code),
      (o) => o.state === 'PaymentSettled',
    );
    expect(settled.payments).toHaveLength(1);
    // The account of the preference read the payment first, and it was the only one asked. (The
    // handler checks the payment again before settling and may try the accounts the platform
    // issued preferences with for that order, which here include the new one.)
    const tokens = mp.requestsTo('GET', `/v1/payments/${approved.id}`).map((r) => r.authorization);
    expect(tokens[0]).toBe(`Bearer APP_USR-pref-${OLD}`);
  });

  it('ignores a notification whose preference belongs to another store than the route', async () => {
    const mine = await checkoutAsGuest(shopClient, changed, changedPayable);
    const orderOfOther = await checkoutAsGuest(shopClient, other, otherPayable);
    const paymentOfOther = forAccount(orderOfOther, grantOf(9106));
    mp.requests = [];

    // The route of "pm-change" with the identifier of a preference of "pm-other".
    const response = await post('/mercadopago/webhook/pm-change-token', {
      topic: 'payment',
      id: String(paymentOfOther.id),
      ref: issuedFor(orderOfOther).token,
    });
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(response.status).toBe(200);
    expect((await readOrder(adminClient, other, orderOfOther.code)).state).toBe('ArrangingPayment');
    expect(mp.requestsTo('GET', `/v1/payments/${paymentOfOther.id}`)).toHaveLength(0);
    void mine;
  });

  it('ignores a payment of another store that arrives on the route with a preference of the store', async () => {
    const mine = await checkoutAsGuest(shopClient, changed, changedPayable);
    const orderOfOther = await checkoutAsGuest(shopClient, other, otherPayable);
    const paymentOfOther = forAccount(orderOfOther, grantOf(9106));

    // The identifier is the store's own, but the payment carries the reference of the other store.
    await post('/mercadopago/webhook/pm-change-token', {
      topic: 'payment',
      id: String(paymentOfOther.id),
      ref: issuedFor(mine).token,
    });
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect((await readOrder(adminClient, other, orderOfOther.code)).state).toBe('ArrangingPayment');
    expect((await readOrder(adminClient, changed, mine.code)).state).toBe('ArrangingPayment');
  });
});
