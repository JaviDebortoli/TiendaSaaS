/**
 * Backend for the storefront end-to-end tests: a real Vendure server (in-memory SQL.js) with the
 * platform and Mercado Pago plugins, one provisioned store, and a stand-in for Mercado Pago:
 * the API (msw) and a checkout page that behaves like the hosted one.
 *
 *   :3300  Vendure (Shop and Admin API, webhook)
 *   :3399  simulated Mercado Pago checkout page
 *
 * Nothing here talks to the real Mercado Pago.
 */
import { RequestContextService, UserService } from '@vendure/core';
import gql from 'graphql-tag';
import http from 'node:http';
import { MercadoPagoConnectionService } from '../../../../packages/vendure-plugin-mercadopago/src';
import { MercadoPagoMock } from '../../../../packages/vendure-plugin-mercadopago/e2e/mp-mock';
import { sendWebhook } from '../../../../packages/vendure-plugin-mercadopago/e2e/shop-helpers';
import { createMpTestEnvironment } from '../../../../packages/vendure-plugin-mercadopago/e2e/test-env';
import { PlatformPlugin } from '../../../server/src/platform/platform.plugin';
import { StoreProvisioningService } from '../../../server/src/platform/provisioning.service';

const VENDURE_PORT = 3300;
const MP_PAGE_PORT = 3399;
const STOREFRONT_URL = 'http://localhost:3301';
const SELLER_ID = 7777;
const ACCESS_TOKEN = 'APP_USR-e2e-store-token';
const WEBHOOK_SECRET = 'test-webhook-secret';

const mp = new MercadoPagoMock();
mp.initPointBase = `http://localhost:${MP_PAGE_PORT}/checkout`;

const env = createMpTestEnvironment(
  VENDURE_PORT,
  { allowInsecureReturnUrls: true, webhookSecret: WEBHOOK_SECRET },
  { plugins: [PlatformPlugin.init({ ensureBaseData: false })] },
);

let nextPaymentId = 5000;

type Scenario = 'approve' | 'approve-late' | 'reject' | 'pending' | 'lie';

const SCENARIOS: { id: Scenario; label: string; note: string }[] = [
  { id: 'approve', label: 'Aprobar pago', note: 'Mercado Pago aprueba y avisa por webhook' },
  { id: 'approve-late', label: 'Aprobar sin aviso', note: 'Aprobado, pero el webhook no llega' },
  { id: 'reject', label: 'Rechazar pago', note: 'La tarjeta es rechazada' },
  { id: 'pending', label: 'Pago pendiente', note: 'Efectivo: queda pendiente' },
  { id: 'lie', label: 'Volver diciendo aprobado', note: 'Pendiente, pero la URL dice approved' },
];

function checkoutPage(preferenceId: string): string {
  const buttons = SCENARIOS.map(
    (s) => `<form method="post" action="/pay/${preferenceId}">
      <input type="hidden" name="scenario" value="${s.id}">
      <button type="submit" id="${s.id}">${s.label}</button> <small>${s.note}</small>
    </form>`,
  ).join('\n');
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Mercado Pago (simulado)</title>
    <body style="font-family:sans-serif;max-width:32rem;margin:3rem auto"><h1>Mercado Pago (simulado)</h1>
    <p>Preferencia <code>${preferenceId}</code>. Elegí qué pasa con el pago:</p>${buttons}</body></html>`;
}

async function pay(preferenceId: string, scenario: Scenario): Promise<string> {
  const preference = mp.preferences.get(preferenceId);
  if (!preference) throw new Error(`Unknown preference ${preferenceId}`);
  const items = preference.items as { unit_price: number; quantity: number }[];
  const amount = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const orderCode = String(preference.external_reference);
  const urls = preference.back_urls as { success: string; failure: string; pending: string };

  const status =
    scenario === 'reject'
      ? 'rejected'
      : scenario === 'pending' || scenario === 'lie'
        ? 'pending'
        : 'approved';
  const payment = mp.addPayment({
    id: ++nextPaymentId,
    status,
    status_detail: status === 'approved' ? 'accredited' : status,
    transaction_amount: Math.round(amount * 100) / 100,
    currency_id: 'ARS',
    external_reference: orderCode,
    ownerToken: ACCESS_TOKEN,
  });
  if (scenario === 'approve') {
    await sendWebhook(VENDURE_PORT, {
      dataId: payment.id,
      userId: SELLER_ID,
      secret: WEBHOOK_SECRET,
    });
  }

  // What Mercado Pago puts in the redirect. "lie" says approved while the payment is pending.
  const reportedStatus = scenario === 'lie' ? 'approved' : status;
  const target = new URL(
    reportedStatus === 'approved'
      ? urls.success
      : status === 'rejected'
        ? urls.failure
        : urls.pending,
  );
  target.searchParams.set('payment_id', String(payment.id));
  target.searchParams.set('status', reportedStatus);
  target.searchParams.set('collection_status', reportedStatus);
  target.searchParams.set('external_reference', orderCode);
  target.searchParams.set('merchant_order_id', '1');
  return target.toString();
}

function startCheckoutPageServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://localhost:${MP_PAGE_PORT}`);
      const checkout = /^\/checkout\/(pref-\d+)$/.exec(url.pathname);
      const payment = /^\/pay\/(pref-\d+)$/.exec(url.pathname);
      if (req.method === 'GET' && checkout) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(checkoutPage(checkout[1]!));
      } else if (req.method === 'POST' && payment) {
        let body = '';
        for await (const chunk of req) body += chunk;
        const scenario = new URLSearchParams(body).get('scenario') as Scenario;
        const location = await pay(payment[1]!, scenario);
        res.writeHead(303, { location });
        res.end();
      } else {
        res.writeHead(404).end('Not found');
      }
    } catch (error) {
      console.error(error);
      res.writeHead(500).end(String(error));
    }
  });
  server.listen(MP_PAGE_PORT);
  return server;
}

async function main() {
  mp.start();
  await env.init();

  const app = env.server.app;
  const requests = app.get(RequestContextService);
  const anonymous = await requests.create({ apiType: 'admin' });
  const superadmin = await app
    .get(UserService)
    .getUserByEmailAddress(anonymous, 'superadmin', 'administrator');
  const ctx = await requests.create({ apiType: 'admin', user: superadmin });

  // The store, exactly as the provisioning script creates it.
  const store = await app.get(StoreProvisioningService).provision(ctx, {
    name: 'Tienda E2E',
    code: 'e2e-tienda',
    token: 'e2e-tienda-token',
    ownerEmail: 'dueno@e2e.test',
    ownerFirstName: 'Dueño',
    ownerLastName: 'E2E',
    ownerPassword: 'e2e-owner-password-1',
    flatRate: 150000,
  });

  // The storefront runs on localhost over http: set its origin directly (provisioning only accepts
  // public https URLs, which is right for production).
  await env.adminClient.asSuperAdmin();
  const { channels } = await env.adminClient.query(gql`
    query {
      channels {
        items {
          id
          code
        }
      }
    }
  `);
  const channelApiId = channels.items.find((c: { code: string }) => c.code === 'e2e-tienda').id;
  await env.adminClient.query(
    gql`
      mutation ($input: UpdateChannelInput!) {
        updateChannel(input: $input) {
          ... on Channel {
            id
          }
        }
      }
    `,
    { input: { id: channelApiId, customFields: { mpStorefrontUrl: STOREFRONT_URL } } },
  );

  // Catalogue: the products live in the default channel; assign them to the store.
  const { products } = await env.adminClient.query(gql`
    query {
      products {
        items {
          id
        }
      }
    }
  `);
  await env.adminClient.query(
    gql`
      mutation ($input: AssignProductsToChannelInput!) {
        assignProductsToChannel(input: $input) {
          id
        }
      }
    `,
    {
      input: {
        channelId: channelApiId,
        productIds: products.items.map((p: { id: string }) => p.id),
        priceFactor: 1,
      },
    },
  );

  await app.get(MercadoPagoConnectionService).link(store.channelId, {
    access_token: ACCESS_TOKEN,
    refresh_token: 'TG-e2e-store-refresh',
    user_id: SELLER_ID,
    expires_in: 15552000,
    scope: 'offline_access',
  });

  startCheckoutPageServer();
  console.log(
    `READY vendure=${VENDURE_PORT} mercadopago-page=${MP_PAGE_PORT} token=e2e-tienda-token`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void env.server.destroy().finally(() => process.exit(0));
  });
}
