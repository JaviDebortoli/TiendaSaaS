import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MercadoPagoConnectionService } from '../src';
import { MercadoPagoMock, OAuthGrant } from './mp-mock';
import {
  checkoutAsGuest,
  PayableStore,
  provisionStore,
  readOrder,
  sendWebhook,
  STOREFRONT_URL,
  waitFor,
} from './shop-helpers';
import { createMpTestEnvironment, createStore, TestStore } from './test-env';

const { server, adminClient, shopClient, port, init } = createMpTestEnvironment(3104);
const mp = new MercadoPagoMock();

let store: TestStore;
let revokedStore: TestStore;
let payable: PayableStore;
let connections: MercadoPagoConnectionService;

const SELLER = 6001;
const grant: OAuthGrant = {
  access_token: 'APP_USR-wh-token',
  refresh_token: 'TG-wh-refresh',
  user_id: SELLER,
  expires_in: 15552000,
  scope: 'offline_access',
};

let nextId = 700;
function approvedPayment(order: { code: string; totalWithTax: number }) {
  return mp.addPayment({
    id: ++nextId,
    status: 'approved',
    transaction_amount: order.totalWithTax / 100,
    currency_id: 'ARS',
    external_reference: order.code,
    ownerToken: grant.access_token,
    collector_id: grant.user_id,
  });
}

async function freshOrder() {
  const order = await checkoutAsGuest(shopClient, store, payable);
  return { order, payment: approvedPayment(order) };
}

/** Lets queued jobs run, so "nothing happened" assertions are meaningful. */
const settleQueue = () => new Promise((resolve) => setTimeout(resolve, 700));

beforeAll(async () => {
  mp.start();
  await init();
  connections = server.app.get(MercadoPagoConnectionService);
  store = await createStore(adminClient, 'wh-a', { storefrontUrl: STOREFRONT_URL });
  revokedStore = await createStore(adminClient, 'wh-b', { storefrontUrl: STOREFRONT_URL });
  payable = await provisionStore(adminClient, store);
  await connections.link(store.channelId, grant);
}, 120_000);

afterAll(async () => {
  mp.stop();
  await server.destroy();
});

beforeEach(() => {
  mp.requests = [];
  mp.paymentLookupDelayMs = 0;
});

describe('signature validation (PRD 9.7, 11)', () => {
  it('rejects a notification signed with another secret and never queries the payment', async () => {
    const { order, payment } = await freshOrder();

    const response = await sendWebhook(port, {
      dataId: payment.id,
      userId: SELLER,
      secret: 'forged',
    });
    await settleQueue();

    expect(response.status).toBe(401);
    expect(mp.requestsTo('GET', `/v1/payments/${payment.id}`)).toHaveLength(0);
    expect((await readOrder(adminClient, store, order.code)).state).toBe('ArrangingPayment');
  });

  it('rejects a notification without x-signature', async () => {
    const { payment } = await freshOrder();

    const response = await sendWebhook(port, {
      dataId: payment.id,
      userId: SELLER,
      unsigned: true,
    });

    expect(response.status).toBe(401);
  });

  it('rejects a valid signature replayed for another payment id', async () => {
    const { payment } = await freshOrder();
    const ts = Math.floor(Date.now() / 1000);
    const requestId = 'req-replay';
    const v1 = createHmac('sha256', 'test-webhook-secret')
      .update(`id:${payment.id};request-id:${requestId};ts:${ts};`)
      .digest('hex');

    const response = await fetch(
      `http://localhost:${port}/mercadopago/webhook?data.id=${payment.id + 1}&type=payment`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': requestId,
          'x-signature': `ts=${ts},v1=${v1}`,
        },
        body: JSON.stringify({ type: 'payment', user_id: SELLER, data: { id: payment.id + 1 } }),
      },
    );

    expect(response.status).toBe(401);
  });

  it.each([
    ['older than the tolerance window', -3600],
    ['too far in the future', 3600],
  ])(
    'rejects a notification with a timestamp %s (replay protection)',
    async (_label, offsetSeconds) => {
      const { payment } = await freshOrder();

      const response = await sendWebhook(port, {
        dataId: payment.id,
        userId: SELLER,
        ts: Math.floor(Date.now() / 1000) + offsetSeconds,
      });

      expect(response.status).toBe(401);
    },
  );

  it('accepts the documented lower-case rule for alphanumeric ids', async () => {
    const response = await sendWebhook(port, {
      dataId: 'ABC123',
      userId: SELLER,
      type: 'merchant_order',
    });

    expect(response.status).toBe(200);
  });
});

describe('acknowledgement (PRD 9.7)', () => {
  it('answers 200 before the payment lookup finishes, then settles in the background', async () => {
    const { order, payment } = await freshOrder();
    mp.paymentLookupDelayMs = 1500;

    const started = Date.now();
    const response = await sendWebhook(port, { dataId: payment.id, userId: SELLER });
    const elapsed = Date.now() - started;

    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(1000);
    const settled = await waitFor(
      () => readOrder(adminClient, store, order.code),
      (o) => o.state === 'PaymentSettled',
      15_000,
    );
    expect(settled.payments).toHaveLength(1);
  });

  it('acknowledges topics it does not handle without doing anything', async () => {
    const response = await sendWebhook(port, { dataId: 1, userId: SELLER, type: 'merchant_order' });
    await settleQueue();

    expect(response.status).toBe(200);
    expect(mp.requests).toHaveLength(0);
  });

  it('rejects a payment notification that carries no payment id', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', 'test-webhook-secret')
      .update(`request-id:req-noid;ts:${ts};`)
      .digest('hex');

    const response = await fetch(`http://localhost:${port}/mercadopago/webhook?type=payment`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-noid',
        'x-signature': `ts=${ts},v1=${v1}`,
      },
      body: JSON.stringify({ type: 'payment', user_id: SELLER }),
    });

    expect(response.status).toBe(400);
  });
});

describe('mp-connect (PRD 9.4)', () => {
  it('leaves a store connected when Mercado Pago confirms its token still works', async () => {
    mp.validTokens.add(grant.access_token);

    const response = await sendWebhook(port, {
      dataId: SELLER,
      userId: SELLER,
      type: 'mp-connect',
    });
    await settleQueue();

    expect(response.status).toBe(200);
    expect((await connections.findAccountByMpUserId(String(SELLER)))!.status).toBe('connected');
  });

  it('marks the store disconnected when the owner revoked access, and stops offering payments', async () => {
    const revokedSeller = 6002;
    await connections.link(revokedStore.channelId, {
      access_token: 'APP_USR-revoked',
      refresh_token: 'TG-revoked',
      user_id: revokedSeller,
      expires_in: 15552000,
      scope: 'offline_access',
    });

    const response = await sendWebhook(port, {
      dataId: revokedSeller,
      userId: revokedSeller,
      type: 'mp-connect',
    });
    expect(response.status).toBe(200);

    const row = await waitFor(
      () => connections.findAccountByMpUserId(String(revokedSeller)),
      (r) => r?.status === 'disconnected',
    );
    expect(connections.isUsable(row)).toBe(false);
    expect(await connections.isChannelUsable(revokedStore.channelId)).toBe(false);
    // The other store is not affected.
    expect((await connections.findAccountByMpUserId(String(SELLER)))!.status).toBe('connected');
  });
});
