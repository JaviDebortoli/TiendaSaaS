import { AccountRegistrationEvent, EventBus } from '@vendure/core';
import gql from 'graphql-tag';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MercadoPagoConnectionService } from '../../vendure-plugin-mercadopago/src';
import { MercadoPagoMock, OAuthGrant } from '../../vendure-plugin-mercadopago/e2e/mp-mock';
import {
  BACK_URLS,
  provisionStore,
  sendWebhook,
  STOREFRONT_URL,
  PayableStore,
} from '../../vendure-plugin-mercadopago/e2e/shop-helpers';
import {
  asSuperAdmin,
  createMpTestEnvironment,
  createStore,
  TestStore,
} from '../../vendure-plugin-mercadopago/e2e/test-env';
import { CommerceError, createCommerce, memorySession } from '../src';

const { server, adminClient, port, init } = createMpTestEnvironment(3109);
const mp = new MercadoPagoMock();

let storeA: TestStore;
let storeB: TestStore;
let payableA: PayableStore;

const SELLER_A = 4101;
const grantA: OAuthGrant = {
  access_token: 'APP_USR-cc-a',
  refresh_token: 'TG-cc-a',
  user_id: SELLER_A,
  expires_in: 15552000,
  scope: 'offline_access',
};

const shopUrl = `http://localhost:${port}/shop-api`;
/** A new buyer: own session, like a new browser. */
const buyer = (store: TestStore) =>
  createCommerce({ apiUrl: shopUrl, channelToken: store.token, session: memorySession() });

let nextPaymentId = 3000;
const mpPayment = (order: { code: string; totalWithTax: number }, overrides = {}) =>
  mp.addPayment({
    id: ++nextPaymentId,
    status: 'approved',
    transaction_amount: order.totalWithTax / 100,
    currency_id: 'ARS',
    external_reference: order.code,
    ownerToken: grantA.access_token,
    collector_id: grantA.user_id,
    ...overrides,
  });

/** Fills a cart and reaches the point where the buyer is sent to Mercado Pago. */
async function readyToPay(commerce: ReturnType<typeof buyer>, email = 'ana@example.test') {
  const products = await commerce.catalog.listProducts({ take: 10 });
  await commerce.cart.addToCart(products.items[0]!.variants[0]!.id, 2);
  await commerce.checkout.setCustomer({ email, firstName: 'Ana', lastName: 'Pérez' });
  await commerce.checkout.setShippingAddress({
    fullName: 'Ana Pérez',
    streetLine1: 'Calle 123',
    city: 'Rosario',
    countryCode: 'AR',
  });
  const [method] = await commerce.checkout.getShippingMethods();
  await commerce.checkout.selectShippingMethod(method!.id);
  const started = await commerce.checkout.startPayment(BACK_URLS);
  const cart = (await commerce.cart.getCart())!;
  return { started, cart };
}

beforeAll(async () => {
  mp.start();
  await init();
  storeA = await createStore(adminClient, 'cc-store-a', { storefrontUrl: STOREFRONT_URL });
  storeB = await createStore(adminClient, 'cc-store-b', { storefrontUrl: STOREFRONT_URL });
  payableA = await provisionStore(adminClient, storeA, { shippingRate: 0 });
  await provisionStore(adminClient, storeB);
  await server.app.get(MercadoPagoConnectionService).link(storeA.channelId, grantA);
  void payableA;
}, 120_000);

afterAll(async () => {
  mp.stop();
  await server.destroy();
});

describe('catalogue', () => {
  it('lists and shows the products of the store, with prices in cents', async () => {
    const { catalog } = buyer(storeA);

    const list = await catalog.listProducts({ take: 10, sort: 'name', direction: 'ASC' });
    const product = await catalog.getProduct(list.items[0]!.slug);

    expect(list.totalItems).toBe(2);
    expect(list.items.map((p) => p.name)).toEqual(['Alpha Mug', 'Beta Notebook']);
    const variant = list.items[0]!.variants[0]!;
    expect(variant.currencyCode).toBe('ARS');
    // Cents: an integer, and never a decimal amount (the test catalogue is priced net of VAT).
    expect(Number.isInteger(variant.priceWithTax)).toBe(true);
    expect(variant.priceWithTax).toBeGreaterThanOrEqual(199900);
    expect(product).toMatchObject({ name: 'Alpha Mug', slug: list.items[0]!.slug });
    expect(await catalog.getProduct('does-not-exist')).toBeNull();
  });
});

describe('guest purchase end to end (PRD 9.6)', () => {
  it('goes from the cart to a settled order, confirmed by the server and not by the redirect', async () => {
    const commerce = buyer(storeA);
    const { started, cart } = await readyToPay(commerce);

    expect(started.redirectUrl).toMatch(/^https:\/\/mp\.test\/checkout\/pref-/);
    const preference = mp.requestsTo('POST', '/checkout/preferences').at(-1)!.body!;
    expect(preference.external_reference).toBe(cart.code);
    expect(preference.auto_return).toBe('approved');

    // Mercado Pago approves and notifies; the buyer comes back to the result page.
    const payment = mpPayment(cart);
    await sendWebhook(port, { dataId: payment.id, userId: SELLER_A });
    const result = await commerce.payment.waitForPayment({
      orderCode: cart.code,
      paymentId: String(payment.id),
      intervalMs: 100,
      syncAfterMs: 5000,
      timeoutMs: 15_000,
    });

    expect(result.state).toBe('paid');
    expect(result.order).toMatchObject({
      state: 'PaymentSettled',
      totalWithTax: cart.totalWithTax,
    });
    expect(result.order!.payments).toEqual([
      expect.objectContaining({ transactionId: String(payment.id), state: 'Settled' }),
    ]);
    expect(await commerce.cart.getCart()).toBeNull(); // the cart is now an order
  });

  it('uses the sync fallback when the webhook never arrives', async () => {
    const commerce = buyer(storeA);
    const { cart } = await readyToPay(commerce, 'late@example.test');
    const payment = mpPayment(cart); // approved, but no webhook is ever sent

    const result = await commerce.payment.waitForPayment({
      orderCode: cart.code,
      paymentId: String(payment.id),
      intervalMs: 100,
      syncAfterMs: 400,
      timeoutMs: 15_000,
    });

    expect(result.state).toBe('paid');
    expect(result.order!.state).toBe('PaymentSettled');
  });

  it('does not believe a redirect that says "success" while Mercado Pago says pending', async () => {
    const commerce = buyer(storeA);
    const { cart } = await readyToPay(commerce, 'voucher@example.test');
    const payment = mpPayment(cart, { status: 'pending' });

    const result = await commerce.payment.waitForPayment({
      orderCode: cart.code,
      paymentId: String(payment.id),
      intervalMs: 100,
      syncAfterMs: 300,
      timeoutMs: 15_000,
    });

    expect(result.state).toBe('pending');
    expect(result.order!.state).toBe('ArrangingPayment');
    expect(result.order!.payments).toEqual([]);
  });

  it('answers failed for a rejected payment and lets the buyer try again on the same order', async () => {
    const commerce = buyer(storeA);
    const { cart } = await readyToPay(commerce, 'declined@example.test');
    const rejected = mpPayment(cart, { status: 'rejected' });

    const result = await commerce.payment.waitForPayment({
      orderCode: cart.code,
      paymentId: String(rejected.id),
      intervalMs: 100,
      syncAfterMs: 300,
      timeoutMs: 15_000,
    });
    expect(result.state).toBe('failed');

    // The order is still payable: a new attempt goes through.
    const again = await commerce.checkout.startPayment(BACK_URLS);
    expect(again.orderCode).toBe(cart.code);
    const approved = mpPayment(cart);
    const retry = await commerce.payment.waitForPayment({
      orderCode: cart.code,
      paymentId: String(approved.id),
      intervalMs: 100,
      syncAfterMs: 300,
      timeoutMs: 15_000,
    });
    expect(retry.state).toBe('paid');
  });

  it('reports a store that cannot take payments', async () => {
    const commerce = buyer(storeB); // never linked a Mercado Pago account
    await expect(readyToPay(commerce, 'nolink@example.test')).rejects.toMatchObject({
      name: 'CommerceError',
      code: 'NOT_CONNECTED',
    });
  });
});

describe('optional account (PRD 6.2)', () => {
  const password = 'a-long-password-1';

  async function register(commerce: ReturnType<typeof buyer>, email: string) {
    let token: string | undefined;
    const subscription = server.app
      .get(EventBus)
      .ofType(AccountRegistrationEvent)
      .subscribe((event) => {
        if (event.user.identifier === email) {
          token = event.user.getNativeAuthenticationMethod().verificationToken ?? undefined;
        }
      });
    await commerce.account.register({ email, password, firstName: 'Reg', lastName: 'Istered' });
    // Vendure publishes the event after the transaction commits, a moment after the mutation.
    for (let i = 0; i < 50 && !token; i++) await new Promise((resolve) => setTimeout(resolve, 100));
    subscription.unsubscribe();
    expect(token).toBeTruthy();
    // The password given at registration is kept (also for a guest who bought before), so the
    // verification link needs none.
    await commerce.account.verifyEmail(token!);
  }

  it('keeps the history of a guest purchase when the buyer registers later with the same email', async () => {
    const email = 'later@example.test';
    const guest = buyer(storeA);
    const { cart } = await readyToPay(guest, email);
    const payment = mpPayment(cart);
    await guest.payment.waitForPayment({
      orderCode: cart.code,
      paymentId: String(payment.id),
      syncAfterMs: 0,
      intervalMs: 100,
    });

    const returning = buyer(storeA);
    await register(returning, email);
    await returning.account.login(email, password);

    expect(await returning.account.getCustomer()).toMatchObject({ emailAddress: email });
    const orders = await returning.account.listOrders();
    expect(orders.items.map((o) => o.code)).toContain(cart.code);
    await returning.account.logout();
    expect(await returning.account.getCustomer()).toBeNull();
  });

  it('reports wrong credentials', async () => {
    await expect(
      buyer(storeA).account.login('later@example.test', 'wrong-password'),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS_ERROR',
    });
  });

  it('V4: a registered email cannot be used for a guest checkout; the shop asks to sign in', async () => {
    const guest = buyer(storeA);
    const products = await guest.catalog.listProducts({ take: 1 });
    await guest.cart.addToCart(products.items[0]!.variants[0]!.id, 1);

    const failure = await guest.checkout
      .setCustomer({ email: 'later@example.test', firstName: 'X', lastName: 'Y' })
      .catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(CommerceError);
    expect(failure).toMatchObject({ code: 'EMAIL_ADDRESS_CONFLICT_ERROR' });
  });
});

describe('stores stay apart', () => {
  it('a buyer of one store never sees the products or the cart of another', async () => {
    const a = buyer(storeA);
    const b = buyer(storeB);
    const products = await a.catalog.listProducts({ take: 1 });
    await a.cart.addToCart(products.items[0]!.variants[0]!.id, 1);

    expect((await a.cart.getCart())!.totalQuantity).toBe(1);
    expect(await b.cart.getCart()).toBeNull();
    expect((await b.catalog.listProducts({ take: 10 })).totalItems).toBe(2); // its own catalogue
  });

  it('V5: the same email as guest in two stores is ONE Customer record, assigned to both stores', async () => {
    const email = 'twice@example.test';
    for (const store of [storeA, storeB]) {
      const commerce = buyer(store);
      const products = await commerce.catalog.listProducts({ take: 1 });
      await commerce.cart.addToCart(products.items[0]!.variants[0]!.id, 1);
      await commerce.checkout.setCustomer({ email, firstName: 'Twice', lastName: 'Buyer' });
    }

    const customerIds = async (token: string) => {
      await asSuperAdmin(adminClient);
      adminClient.setChannelToken(token);
      const { customers } = await adminClient.query(
        gql`
          query ($email: String!) {
            customers(options: { filter: { emailAddress: { eq: $email } } }) {
              items {
                id
              }
            }
          }
        `,
        { email },
      );
      return (customers.items as { id: string }[]).map((c) => c.id);
    };
    const inA = await customerIds(storeA.token);
    const inB = await customerIds(storeB.token);
    const inDefault = await customerIds('e2e-default-channel');
    expect(inA).toHaveLength(1);
    expect(inB).toEqual(inA); // the very same record is visible in both stores
    expect(inDefault).toEqual(inA);
  });
});
