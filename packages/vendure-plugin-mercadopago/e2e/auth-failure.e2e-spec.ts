import { ConfigService, EventBus, RequestContext } from '@vendure/core';
import { SimpleGraphQLClient } from '@vendure/testing';
import gql from 'graphql-tag';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MercadoPagoAttentionEvent, MercadoPagoConnectionService } from '../src';
import { MP_PLUGIN_OPTIONS } from '../src/constants';
import {
  accountNotLinkedMessage,
  MercadoPagoPaymentOperations,
} from '../src/services/payment-operations.service';
import { MercadoPagoPaymentProcessor } from '../src/services/payment-processor.service';
import { MercadoPagoMock, OAuthGrant } from './mp-mock';
import {
  BACK_URLS,
  checkoutAsGuest,
  PayableStore,
  provisionStore,
  readOrder,
  referenceFields,
  STOREFRONT_URL,
  useIssuer,
  waitFor,
} from './shop-helpers';
import { createMpTestEnvironment, createStore, TestStore } from './test-env';

const PORT = 3114;
// The pause after a check that found the account fine is off here: each case wants its own check.
const { server, adminClient, shopClient, init } = createMpTestEnvironment(PORT, {
  authCheckPauseMinutes: 0,
});
const mp = new MercadoPagoMock();
const events: MercadoPagoAttentionEvent[] = [];

let store: TestStore;
let payable: PayableStore;
let connections: MercadoPagoConnectionService;
let operations: MercadoPagoPaymentOperations;
let processor: MercadoPagoPaymentProcessor;

const SELLER = 8001;
let sequence = 0;
/** A fresh pair of tokens for the account, so no case depends on what another one left stored. */
const grants = (): OAuthGrant => {
  sequence++;
  return {
    access_token: `APP_USR-af-${sequence}`,
    refresh_token: `TG-af-${sequence}`,
    user_id: SELLER,
    expires_in: 15552000,
    scope: 'offline_access',
  };
};

const CREATE = gql`
  mutation ($input: MercadoPagoCheckoutInput!) {
    createMercadoPagoCheckout(input: $input) {
      __typename
      ... on MercadoPagoCheckout {
        preferenceId
      }
      ... on MercadoPagoError {
        reason
        message
      }
    }
  }
`;
const createWith = (client: SimpleGraphQLClient, orderCode: string) =>
  client
    .query(CREATE, { input: { orderCode, ...BACK_URLS } })
    .then((r) => r.createMercadoPagoCheckout);
const create = (orderCode: string) => createWith(shopClient, orderCode);

/** The store sells with the account again, holding exactly these tokens. */
async function relink(grant: OAuthGrant) {
  await connections.link(store.channelId, grant);
  mp.validTokens.add(grant.access_token);
  return grant;
}
const accountStatus = async () => (await connections.findAccountByMpUserId(String(SELLER)))!.status;
const linkStatuses = async () =>
  (await connections.listLinks(store.channelId)).map((l) => l.status);
const reasons = () => events.map((e) => e.reason);
const preferenceRequests = () => mp.requestsTo('POST', '/checkout/preferences');

let paymentId = 7000;
const approvedPayment = (order: { code: string; totalWithTax: number }, token: string) =>
  mp.addPayment({
    id: ++paymentId,
    status: 'approved',
    transaction_amount: order.totalWithTax / 100,
    currency_id: 'ARS',
    ...referenceFields(order),
    ownerToken: token,
    collector_id: SELLER,
  });

beforeAll(async () => {
  mp.start();
  await init();
  useIssuer(server.app);
  connections = server.app.get(MercadoPagoConnectionService);
  operations = server.app.get(MercadoPagoPaymentOperations);
  processor = server.app.get(MercadoPagoPaymentProcessor);
  server.app
    .get(EventBus)
    .ofType(MercadoPagoAttentionEvent)
    .subscribe((event) => events.push(event));
  store = await createStore(adminClient, 'af-a', { storefrontUrl: STOREFRONT_URL });
  payable = await provisionStore(adminClient, store);
}, 120_000);

afterAll(async () => {
  mp.stop();
  await server.destroy();
});

beforeEach(() => {
  mp.reset();
  events.length = 0;
});

describe('a 401 from Mercado Pago is a suspected revocation (PRD 9.4)', () => {
  it('renews the token and repeats the call once: the buyer does not notice', async () => {
    const grant = await relink(grants());
    const next = grants();
    mp.rejectedTokens.set(grant.access_token, 401);
    mp.refreshGrants.set(grant.refresh_token, next);
    const order = await checkoutAsGuest(shopClient, store, payable);

    const result = await create(order.code);

    expect(result.__typename).toBe('MercadoPagoCheckout');
    const requests = preferenceRequests();
    expect(requests.map((r) => r.authorization)).toEqual([
      `Bearer ${grant.access_token}`,
      `Bearer ${next.access_token}`,
    ]);
    // The same request twice, so Mercado Pago cannot create two preferences.
    expect(requests[1]!.idempotencyKey).toBe(requests[0]!.idempotencyKey);
    expect(mp.requestsTo('GET', '/users/me')).toHaveLength(1);
    expect(mp.requestsTo('POST', '/oauth/token')).toHaveLength(1);
    expect(await accountStatus()).toBe('connected');
    expect(await linkStatuses()).toEqual(['active']);
    expect(events).toHaveLength(0);
  });

  it('retires the links when the renewal is refused, tells the buyer plainly and stops offering the method', async () => {
    const grant = await relink(grants());
    mp.rejectedTokens.set(grant.access_token, 401); // and no refresh grant: Mercado Pago refuses it
    const order = await checkoutAsGuest(shopClient, store, payable);

    const result = await create(order.code);

    expect(result).toMatchObject({ __typename: 'MercadoPagoError', reason: 'NOT_CONNECTED' });
    expect(result.message).toContain('Mercado Pago');
    expect(await accountStatus()).toBe('disconnected');
    expect(await linkStatuses()).toEqual(['retired']);
    expect(reasons()).toEqual(['account_disconnected']);
    expect(await connections.isChannelUsable(store.channelId)).toBe(false);
  });

  it('changes nothing when the check cannot tell, and the buyer sees the generic error', async () => {
    const grant = await relink(grants());
    mp.rejectedTokens.set(grant.access_token, 401);
    mp.meStatus = 503;
    const order = await checkoutAsGuest(shopClient, store, payable);

    const result = await create(order.code);

    expect(result).toMatchObject({
      __typename: 'MercadoPagoError',
      reason: 'MERCADOPAGO_UNAVAILABLE',
    });
    expect(await accountStatus()).toBe('connected');
    expect(await linkStatuses()).toEqual(['active']);
    expect(mp.requestsTo('POST', '/oauth/token')).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('repeats the call only once: a second rejection is the answer and is not checked again', async () => {
    const grant = await relink(grants());
    const next = grants();
    mp.rejectedTokens.set(grant.access_token, 401);
    mp.rejectedTokens.set(next.access_token, 401);
    mp.refreshGrants.set(grant.refresh_token, next);
    const order = await checkoutAsGuest(shopClient, store, payable);

    const result = await create(order.code);

    expect(result).toMatchObject({ reason: 'MERCADOPAGO_UNAVAILABLE' });
    expect(preferenceRequests()).toHaveLength(2);
    expect(mp.requestsTo('GET', '/users/me')).toHaveLength(1);
    expect(mp.requestsTo('POST', '/oauth/token')).toHaveLength(1);
    expect(await accountStatus()).toBe('connected');
  });

  it('starts one check for ten checkouts that fail at once', async () => {
    const grant = await relink(grants());
    const next = grants();
    mp.rejectedTokens.set(grant.access_token, 401);
    mp.refreshGrants.set(grant.refresh_token, next);
    // Each buyer has a session of their own.
    const clients = Array.from(
      { length: 10 },
      () =>
        new SimpleGraphQLClient(server.app.get(ConfigService), `http://localhost:${PORT}/shop-api`),
    );
    const orders = await Promise.all(
      clients.map((client, i) =>
        checkoutAsGuest(client, store, payable, [{}], `buyer${i}@example.test`),
      ),
    );

    const results = await Promise.all(orders.map((o, i) => createWith(clients[i]!, o.code)));

    expect(results.map((r) => r.__typename)).toEqual(Array(10).fill('MercadoPagoCheckout'));
    expect(mp.requestsTo('GET', '/users/me')).toHaveLength(1);
    expect(mp.requestsTo('POST', '/oauth/token')).toHaveLength(1);
    expect(await linkStatuses()).toEqual(['active']);
  }, 120_000);

  it('does not check an account again for a rejection during the pause after it was found fine', async () => {
    const grant = await relink(grants());
    mp.rejectedTokens.set(grant.access_token, 401);
    mp.meStatus = 200; // Mercado Pago accepts the token on the check, so nothing is concluded
    const options = server.app.get(MP_PLUGIN_OPTIONS);
    (connections as unknown as { verifiedAt: Map<string, number> }).verifiedAt.clear();
    options.authCheckPauseMinutes = 5;
    try {
      const account = (await connections.findAccountByMpUserId(String(SELLER)))!;
      const read = () => operations.readPayment(account, '4242');

      await expect(read()).rejects.toMatchObject({ kind: 'auth', status: 401 });
      await expect(read()).rejects.toMatchObject({ kind: 'auth', status: 401 });
      expect(mp.requestsTo('GET', '/users/me')).toHaveLength(1);

      options.authCheckPauseMinutes = 0;
      await expect(read()).rejects.toMatchObject({ kind: 'auth', status: 401 });
      expect(mp.requestsTo('GET', '/users/me')).toHaveLength(2);
      expect(await accountStatus()).toBe('connected');
      expect(mp.requestsTo('POST', '/oauth/token')).toHaveLength(0);
    } finally {
      options.authCheckPauseMinutes = 0;
    }
  });

  it('does not retire an account because the application itself is refused (a wrong client secret)', async () => {
    const grant = await relink(grants());
    mp.rejectedTokens.set(grant.access_token, 401);
    mp.oauthStatus = 401; // `invalid_client`: nothing to do with the seller's access
    const order = await checkoutAsGuest(shopClient, store, payable);

    const result = await create(order.code);

    expect(result).toMatchObject({ reason: 'MERCADOPAGO_UNAVAILABLE' });
    expect(await accountStatus()).toBe('connected');
    expect(await linkStatuses()).toEqual(['active']);
    expect(events).toHaveLength(0);
  });

  it('does not retire an account whose store authorized it again while the renewal was refused', async () => {
    const grant = await relink(grants());
    const reauthorized = grants();
    mp.rejectedTokens.set(grant.access_token, 401); // the renewal below is refused: no refresh grant
    // The renewal is held in flight until the store has authorized the account again: no timers.
    let finishRenewal!: () => void;
    mp.oauthGate = new Promise<void>((resolve) => (finishRenewal = resolve));
    const { id } = (await connections.findAccountByMpUserId(String(SELLER)))!;

    const verdict = connections.verifyAccess(id, grant.access_token);
    await waitFor(
      async () => mp.requestsTo('POST', '/oauth/token').length,
      (renewals) => renewals === 1,
    );
    await connections.link(store.channelId, reauthorized); // new tokens, written under no lock
    finishRenewal();

    expect((await verdict).kind).toBe('replaced');
    expect(await accountStatus()).toBe('connected');
    expect(await linkStatuses()).toEqual(['active']);
    expect(events).toHaveLength(0);
  });

  it('does not check anything for a 403 or a 404', async () => {
    const grant = await relink(grants());
    const account = (await connections.findAccountByMpUserId(String(SELLER)))!;

    mp.rejectedTokens.set(grant.access_token, 403);
    await expect(operations.readPayment(account, '4242')).rejects.toMatchObject({
      kind: 'auth',
      status: 403,
    });
    mp.rejectedTokens.clear();
    // A payment this account does not see: Mercado Pago answers 404.
    expect(await operations.readPayment(account, '4242')).toBeNull();

    expect(mp.requestsTo('GET', '/users/me')).toHaveLength(0);
    expect(mp.requestsTo('POST', '/oauth/token')).toHaveLength(0);
    expect(await accountStatus()).toBe('connected');
    expect(await linkStatuses()).toEqual(['active']);
  });

  describe('reading a payment', () => {
    it('a revocation found while reading an approved payment tells the store and the platform that it could not be checked', async () => {
      const grant = await relink(grants());
      const order = await checkoutAsGuest(shopClient, store, payable);
      const payment = approvedPayment(order, grant.access_token);
      mp.rejectedTokens.set(grant.access_token, 401);

      const result = await processor.process({
        mpPaymentId: String(payment.id),
        mpUserId: String(SELLER),
      });

      expect(result).toEqual({ outcome: 'ignored', reason: 'not_connected' });
      expect(await accountStatus()).toBe('disconnected');
      expect(reasons()).toEqual(['account_disconnected', 'unverifiable_payment']);
      expect(events[1]!.channelId).toBe(store.channelId);
      expect(events[1]!.details).toMatchObject({ mpPaymentId: String(payment.id) });
      expect((await readOrder(adminClient, store, order.code)).state).toBe('ArrangingPayment');
    });

    it('does the same through the sync mutation, which knows the preference', async () => {
      const grant = await relink(grants());
      const order = await checkoutAsGuest(shopClient, store, payable);
      const payment = approvedPayment(order, grant.access_token);
      mp.rejectedTokens.set(grant.access_token, 401);

      const result = await processor.process({
        mpPaymentId: String(payment.id),
        channelId: store.channelId,
        externalReference: referenceFields(order).external_reference,
      });

      expect(result).toEqual({ outcome: 'ignored', reason: 'not_connected' });
      expect(reasons()).toEqual(['account_disconnected', 'unverifiable_payment']);
      expect(events[1]!.channelId).toBe(store.channelId);
    });

    it('retries the notification, like any outage, when the check cannot tell', async () => {
      const grant = await relink(grants());
      const order = await checkoutAsGuest(shopClient, store, payable);
      const payment = approvedPayment(order, grant.access_token);
      mp.rejectedTokens.set(grant.access_token, 401);
      mp.meStatus = 503;

      await expect(
        processor.process({ mpPaymentId: String(payment.id), mpUserId: String(SELLER) }),
      ).rejects.toMatchObject({ kind: 'unavailable' });

      expect(await accountStatus()).toBe('connected');
      expect(await linkStatuses()).toEqual(['active']);
      expect(events).toHaveLength(0);
    });
  });

  describe('refunds and cancellations', () => {
    const ctx = () => ({ channelId: store.channelId }) as RequestContext;

    it('a confirmed revocation fails a refund with the message of an account that is gone', async () => {
      const grant = await relink(grants());
      mp.rejectedTokens.set(grant.access_token, 401);

      const result = await operations.refund(ctx(), '4242', String(SELLER), 100, 100, 'key-1');

      expect(result).toEqual({ ok: false, message: accountNotLinkedMessage(String(SELLER)) });
      expect(await accountStatus()).toBe('disconnected');
    });

    it('a confirmed revocation fails a cancellation the same way', async () => {
      const grant = await relink(grants());
      mp.rejectedTokens.set(grant.access_token, 401);

      const result = await operations.cancel(ctx(), '4242', String(SELLER));

      expect(result).toEqual({ ok: false, message: accountNotLinkedMessage(String(SELLER)) });
      expect(await linkStatuses()).toEqual(['retired']);
    });

    it('a refund whose token could be renewed goes through, repeated once', async () => {
      const grant = await relink(grants());
      const next = grants();
      mp.rejectedTokens.set(grant.access_token, 401);
      mp.refreshGrants.set(grant.refresh_token, next);
      const order = await checkoutAsGuest(shopClient, store, payable);
      const payment = approvedPayment(order, next.access_token);

      const result = await operations.refund(
        ctx(),
        String(payment.id),
        String(SELLER),
        order.totalWithTax,
        order.totalWithTax,
        'key-2',
      );

      expect(result).toMatchObject({ ok: true });
      expect(await accountStatus()).toBe('connected');
      expect(mp.requestsTo('POST', `/v1/payments/${payment.id}/refunds`)).toHaveLength(2);
    });
  });
});
