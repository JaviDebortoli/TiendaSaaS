import type { INestApplicationContext } from '@nestjs/common';
import { Order, TransactionalConnection } from '@vendure/core';
import { SimpleGraphQLClient } from '@vendure/testing';
import gql from 'graphql-tag';
import { createHmac } from 'node:crypto';
import { MercadoPagoConnectionService, MercadoPagoPreferenceRegistry } from '../src';
import { asSuperAdmin, TestStore } from './test-env';

/** What the platform issued for an order: the reference and the preference id Mercado Pago answered. */
export interface IssuedPreference {
  externalReference: string;
  preferenceId: string;
  /** The registry identifier: what a per-preference `notification_url` carries as `ref`. */
  token: string;
  /** `user_id` of the account the preference was issued with. */
  accountUserId: string;
}

const issuedByOrder = new Map<string, IssuedPreference>();
let issuer: INestApplicationContext | undefined;
let preferenceCounter = 0;

/**
 * Makes `checkoutAsGuest` issue a preference for every order it brings to payment, with the
 * account its store sells with at that moment, as the checkout does (PRD 9.6). A spec calls it once
 * with `server.app`.
 */
export function useIssuer(app: INestApplicationContext): void {
  issuer = app;
}

/**
 * Issues a preference for an order with the account `mpUserId` (the store's active one when
 * omitted). Written straight to the registry, with a preference id as Mercado Pago would answer.
 */
export async function issuePreference(
  app: INestApplicationContext,
  order: { id: string | number; code: string; totalWithTax: number },
  options: { channelId?: string | number; mpUserId?: string } = {},
): Promise<IssuedPreference> {
  const connection = app.get(TransactionalConnection);
  const connections = app.get(MercadoPagoConnectionService);
  const registry = app.get(MercadoPagoPreferenceRegistry);
  const channelId =
    options.channelId ??
    (
      await connection.rawConnection
        .getRepository(Order)
        .findOneOrFail({ where: { code: order.code }, relations: { channels: true } })
    ).channels.find((channel) => channel.code !== '__default_channel__')!.id;
  const link = options.mpUserId
    ? (await connections.listLinks(channelId)).find((l) => l.account.mpUserId === options.mpUserId)
    : await connections.findActiveLink(channelId);
  if (!link) throw new Error(`No link to issue a preference for order ${order.code}.`);
  const entry = await registry.issue({
    orderId: Number(String(order.id).replace(/^T_/, '')),
    orderCode: order.code,
    channelId,
    accountId: link.accountId,
    linkId: link.id,
    totalWithTax: order.totalWithTax,
    idempotencyKey: `test-${++preferenceCounter}`,
  });
  const preferenceId = `pref-test-${preferenceCounter}`;
  await registry.setPreferenceId(entry.id, preferenceId);
  const issued = {
    externalReference: entry.externalReference,
    preferenceId,
    token: entry.token,
    accountUserId: link.account.mpUserId,
  };
  issuedByOrder.set(order.code, issued);
  return issued;
}

/** The latest preference issued for an order by `checkoutAsGuest`, or by `issuePreference`. */
export function issuedFor(order: { code: string }): IssuedPreference {
  const issued = issuedByOrder.get(order.code);
  if (!issued) throw new Error(`No preference was issued for order ${order.code}.`);
  return issued;
}

/**
 * The fields of a Mercado Pago payment that say which preference it came from, for the latest
 * preference issued for the order: what a payment made from that preference carries. For an order
 * no preference was issued for (its store sold with no account, or the code is invented) it is the
 * bare order code, the old format, which no payment can settle with.
 */
export function referenceFields(order: { code: string }): {
  external_reference: string;
  preferenceId?: string;
} {
  const issued = issuedByOrder.get(order.code);
  return issued
    ? { external_reference: issued.externalReference, preferenceId: issued.preferenceId }
    : { external_reference: order.code };
}

export const STOREFRONT_URL = 'https://tienda.example.test';

export const BACK_URLS = {
  successUrl: `${STOREFRONT_URL}/checkout/result?status=success`,
  failureUrl: `${STOREFRONT_URL}/checkout/result?status=failure`,
  pendingUrl: `${STOREFRONT_URL}/checkout/result?status=pending`,
};

export interface PayableStore {
  variantIds: string[];
  paymentMethodCode: string;
  shippingMethodId: string;
}

/**
 * Gives a store what PRD 5.4 gives it: the Mercado Pago payment method (restricted by the
 * "connected" checker), a pickup shipping method and the catalogue.
 */
export async function provisionStore(
  adminClient: SimpleGraphQLClient,
  store: TestStore,
  options: { shippingRate?: number } = {},
): Promise<PayableStore> {
  await asSuperAdmin(adminClient);
  adminClient.setChannelToken(store.token);

  await adminClient.query(
    gql`
      mutation ($input: CreatePaymentMethodInput!) {
        createPaymentMethod(input: $input) {
          id
        }
      }
    `,
    {
      input: {
        code: 'mercado-pago',
        enabled: true,
        handler: { code: 'mercado-pago', arguments: [] },
        checker: { code: 'mercado-pago-connected', arguments: [] },
        translations: [{ languageCode: 'en', name: 'Mercado Pago', description: '' }],
      },
    },
  );
  const { createShippingMethod } = await adminClient.query<{
    createShippingMethod: { id: string };
  }>(
    gql`
      mutation ($input: CreateShippingMethodInput!) {
        createShippingMethod(input: $input) {
          id
        }
      }
    `,
    {
      input: {
        code: 'pickup',
        fulfillmentHandler: 'manual-fulfillment',
        checker: {
          code: 'default-shipping-eligibility-checker',
          arguments: [{ name: 'orderMinimum', value: '0' }],
        },
        calculator: {
          code: 'default-shipping-calculator',
          arguments: [
            { name: 'rate', value: String(options.shippingRate ?? 0) },
            { name: 'includesTax', value: 'include' },
            { name: 'taxRate', value: '0' },
          ],
        },
        translations: [{ languageCode: 'en', name: 'Pickup', description: '' }],
      },
    },
  );

  // Products live in the default channel; a store sees the ones assigned to it.
  adminClient.setChannelToken('e2e-default-channel');
  const { products } = await adminClient.query<{ products: { items: { id: string }[] } }>(gql`
    query {
      products {
        items {
          id
        }
      }
    }
  `);
  await adminClient.query(
    gql`
      mutation ($input: AssignProductsToChannelInput!) {
        assignProductsToChannel(input: $input) {
          id
        }
      }
    `,
    {
      input: {
        channelId: store.apiChannelId,
        productIds: products.items.map((p) => p.id),
        priceFactor: 1,
      },
    },
  );

  adminClient.setChannelToken(store.token);
  const { products: storeProducts } = await adminClient.query<{
    products: { items: { variants: { id: string }[] }[] };
  }>(gql`
    query {
      products {
        items {
          variants {
            id
          }
        }
      }
    }
  `);
  return {
    variantIds: storeProducts.items.flatMap((p) => p.variants.map((v) => v.id)),
    paymentMethodCode: 'mercado-pago',
    shippingMethodId: createShippingMethod.id,
  };
}

export interface CheckoutOrder {
  id: string;
  code: string;
  totalWithTax: number;
}

const ORDER_FIELDS = `
  ... on Order {
    id
    code
    state
    totalWithTax
  }
  ... on ErrorResult {
    errorCode
    message
  }
`;

async function run<T>(
  client: SimpleGraphQLClient,
  query: string,
  variables?: Record<string, unknown>,
) {
  const result = await client.query<Record<string, T & { errorCode?: string; message?: string }>>(
    gql(query),
    variables,
  );
  const [value] = Object.values(result);
  if (value && typeof value === 'object' && 'errorCode' in value && value.errorCode) {
    throw new Error(`${value.errorCode}: ${value.message}`);
  }
  return value as T;
}

/** A guest fills a cart and reaches ArrangingPayment, like PRD 9.6 step 1. */
export async function checkoutAsGuest(
  shopClient: SimpleGraphQLClient,
  store: TestStore,
  payable: PayableStore,
  items: { variantIndex?: number; quantity?: number }[] = [{}],
  email = 'buyer@example.test',
): Promise<CheckoutOrder> {
  shopClient.setChannelToken(store.token);
  await shopClient.asAnonymousUser();
  for (const item of items) {
    await run(
      shopClient,
      `mutation ($id: ID!, $q: Int!) { addItemToOrder(productVariantId: $id, quantity: $q) { ${ORDER_FIELDS} } }`,
      { id: payable.variantIds[item.variantIndex ?? 0], q: item.quantity ?? 1 },
    );
  }
  await run(
    shopClient,
    `mutation ($input: CreateCustomerInput!) { setCustomerForOrder(input: $input) { ${ORDER_FIELDS} } }`,
    { input: { emailAddress: email, firstName: 'Buyer', lastName: 'Guest' } },
  );
  await run(
    shopClient,
    `mutation ($input: CreateAddressInput!) { setOrderShippingAddress(input: $input) { ${ORDER_FIELDS} } }`,
    {
      input: {
        fullName: 'Buyer Guest',
        streetLine1: 'Calle 123',
        city: 'Buenos Aires',
        postalCode: 'C1000',
        countryCode: 'AR',
      },
    },
  );
  await run(
    shopClient,
    `mutation ($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { ${ORDER_FIELDS} } }`,
    { id: [payable.shippingMethodId] },
  );
  const order = await run<CheckoutOrder>(
    shopClient,
    `mutation { transitionOrderToState(state: "ArrangingPayment") { ... on Order { id code state totalWithTax } ... on OrderStateTransitionError { errorCode message } } }`,
  );
  if (issuer) {
    // The store may not sell with any account yet; then there is nothing to issue.
    await issuePreference(issuer, order, { channelId: store.channelId }).catch(() => undefined);
  }
  return order;
}

export interface WebhookOptions {
  dataId: string | number;
  userId?: string | number;
  secret?: string;
  type?: string;
  requestId?: string;
  /** Epoch seconds. Defaults to now. */
  ts?: number;
  path?: string;
  /** Send no `x-signature` at all. */
  unsigned?: boolean;
  /** Omit `data.id` from the URL (it stays in the body). */
  omitQueryDataId?: boolean;
  extraQuery?: Record<string, string>;
}

/** Sends a notification signed exactly as Mercado Pago does, with the documented algorithm. */
export async function sendWebhook(port: number, options: WebhookOptions): Promise<Response> {
  const dataId = String(options.dataId);
  const requestId = options.requestId ?? `req-${Math.random().toString(36).slice(2)}`;
  const ts = String(options.ts ?? Math.floor(Date.now() / 1000));
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', options.secret ?? 'test-webhook-secret')
    .update(manifest)
    .digest('hex');
  const type = options.type ?? 'payment';
  const query = new URLSearchParams({
    ...(options.omitQueryDataId ? {} : { 'data.id': dataId }),
    type,
    ...options.extraQuery,
  });
  return fetch(`http://localhost:${port}${options.path ?? '/mercadopago/webhook'}?${query}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
      ...(options.unsigned ? {} : { 'x-signature': `ts=${ts},v1=${v1}` }),
    },
    body: JSON.stringify({
      action: `${type}.updated`,
      type,
      user_id: options.userId,
      data: { id: dataId },
    }),
  });
}

export async function waitFor<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 10_000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await read();
    if (predicate(value)) return value;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for condition. Last value: ${JSON.stringify(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export interface AdminOrder {
  id: string;
  code: string;
  state: string;
  totalWithTax: number;
  payments: { id: string; transactionId: string; state: string; amount: number }[];
  history: { items: { type: string; data: Record<string, unknown> }[] };
}

/** Reads an order as the store's administrator (needs ReadOrder in the store's channel). */
export async function readOrder(
  adminClient: SimpleGraphQLClient,
  store: TestStore,
  code: string,
): Promise<AdminOrder> {
  await asSuperAdmin(adminClient);
  adminClient.setChannelToken(store.token);
  const { orders } = await adminClient.query<{ orders: { items: AdminOrder[] } }>(
    gql`
      query ($code: String!) {
        orders(options: { filter: { code: { eq: $code } } }) {
          items {
            id
            code
            state
            totalWithTax
            payments {
              id
              transactionId
              state
              amount
            }
            history {
              items {
                type
                data
              }
            }
          }
        }
      }
    `,
    { code },
  );
  return orders.items[0]!;
}

export const notesOf = (order: AdminOrder) =>
  order.history.items
    .filter((entry) => entry.type === 'ORDER_NOTE')
    .map((entry) => String(entry.data.note));
