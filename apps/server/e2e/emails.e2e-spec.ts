import { EventBus, RequestContextService, UserService } from '@vendure/core';
import type { EmailDetails } from '@vendure/email-plugin';
import gql from 'graphql-tag';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MercadoPagoAttentionEvent,
  MercadoPagoConnectionService,
} from 'vendure-plugin-mercadopago';
import { addressOf, formatSender } from '../src/email/branding';
import { StoreProvisioningService } from '../src/platform/provisioning.service';
import {
  createPlatformTestEnvironment,
  E2E_DEFAULT_CHANNEL_TOKEN,
  TEST_PLATFORM,
} from './test-env';

const emails: EmailDetails[] = [];
const overridesDir = mkdtempSync(path.join(tmpdir(), 'store-templates-'));
process.env.PLATFORM_ALERT_EMAIL = 'ops@plataforma.test';

const { server, adminClient, shopClient, init } = createPlatformTestEnvironment(3202, {
  sink: (email) => emails.push(email),
  overridesDir,
});

interface Store {
  channelId: string | number;
  token: string;
  ownerEmail: string;
}

async function provision(name: string, code: string, storefrontUrl?: string): Promise<Store> {
  const app = server.app;
  const requests = app.get(RequestContextService);
  const anonymous = await requests.create({ apiType: 'admin' });
  const user = await app
    .get(UserService)
    .getUserByEmailAddress(anonymous, 'superadmin', 'administrator');
  const ctx = await requests.create({ apiType: 'admin', user });
  const ownerEmail = `dueno@${code}.test`;
  const store = await app.get(StoreProvisioningService).provision(ctx, {
    name,
    code,
    storefrontUrl,
    ownerEmail,
    ownerFirstName: 'Dueño',
    ownerLastName: name,
    ownerPassword: `password-${code}-123`,
  });
  return { channelId: store.channelId, token: store.token, ownerEmail };
}

/** Waits for an email that matches, so the test does not depend on how long the job queue takes. */
async function emailWhere(predicate: (email: EmailDetails) => boolean, timeoutMs = 10_000) {
  const started = Date.now();
  for (;;) {
    const found = emails.find(predicate);
    if (found) return found;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `No matching email. Sent so far: ${JSON.stringify(emails.map((e) => [e.subject, e.recipient]))}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** A guest buys one item and the order is placed with the dummy payment method. */
async function placeOrder(store: Store, buyer: string): Promise<string> {
  await adminClient.asSuperAdmin();
  adminClient.setChannelToken(store.token);
  const { createProduct } = await adminClient.query(
    gql`
      mutation ($input: CreateProductInput!) {
        createProduct(input: $input) {
          id
        }
      }
    `,
    {
      input: {
        translations: [
          {
            languageCode: 'es',
            name: 'Pan',
            slug: `pan-${Math.random().toString(36).slice(2)}`,
            description: '',
          },
        ],
      },
    },
  );
  const { createProductVariants } = await adminClient.query(
    gql`
      mutation ($input: [CreateProductVariantInput!]!) {
        createProductVariants(input: $input) {
          id
        }
      }
    `,
    {
      input: [
        {
          productId: createProduct.id,
          sku: `PAN-${Math.random().toString(36).slice(2)}`,
          price: 100000,
          stockOnHand: 10,
          translations: [{ languageCode: 'es', name: 'Pan' }],
        },
      ],
    },
  );
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
        code: 'dummy',
        enabled: true,
        handler: {
          code: 'dummy-payment-handler',
          arguments: [{ name: 'automaticSettle', value: 'true' }],
        },
        translations: [{ languageCode: 'es', name: 'Dummy', description: '' }],
      },
    },
  );

  shopClient.setChannelToken(store.token);
  await shopClient.asAnonymousUser();
  await shopClient.query(
    gql`
      mutation ($id: ID!) {
        addItemToOrder(productVariantId: $id, quantity: 1) {
          ... on Order {
            id
          }
        }
      }
    `,
    { id: createProductVariants[0].id },
  );
  await shopClient.query(
    gql`
      mutation ($input: CreateCustomerInput!) {
        setCustomerForOrder(input: $input) {
          ... on Order {
            id
          }
        }
      }
    `,
    { input: { emailAddress: buyer, firstName: 'Comprador', lastName: 'Invitado' } },
  );
  await shopClient.query(
    gql`
      mutation ($input: CreateAddressInput!) {
        setOrderShippingAddress(input: $input) {
          ... on Order {
            id
          }
        }
      }
    `,
    {
      input: { fullName: 'Comprador', streetLine1: 'Calle 1', city: 'Rosario', countryCode: 'AR' },
    },
  );
  const { eligibleShippingMethods } = await shopClient.query(gql`
    query {
      eligibleShippingMethods {
        id
      }
    }
  `);
  await shopClient.query(
    gql`
      mutation ($id: [ID!]!) {
        setOrderShippingMethod(shippingMethodId: $id) {
          ... on Order {
            id
          }
        }
      }
    `,
    { id: [eligibleShippingMethods[0].id] },
  );
  await shopClient.query(gql`
    mutation {
      transitionOrderToState(state: "ArrangingPayment") {
        ... on Order {
          id
        }
      }
    }
  `);
  const { addPaymentToOrder } = await shopClient.query(gql`
    mutation {
      addPaymentToOrder(input: { method: "dummy", metadata: {} }) {
        ... on Order {
          code
          state
        }
        ... on ErrorResult {
          message
        }
      }
    }
  `);
  expect(addPaymentToOrder.state).toBe('PaymentSettled');
  return addPaymentToOrder.code as string;
}

let bakery: Store;
let bookshop: Store;

beforeAll(async () => {
  await init();
  bakery = await provision('Panadería Don Juan', 'panaderia', 'https://panaderia.example.test');
  bookshop = await provision('Librería Luna', 'libreria-luna');
  await adminClient.asSuperAdmin();

  // Only the bookshop restyles its order confirmation.
  const folder = path.join(overridesDir, 'libreria-luna', 'order-confirmation');
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    path.join(folder, 'body.hbs'),
    '<mjml><mj-body><mj-section><mj-column><mj-text>TEMPLATE-DE-LUNA pedido {{ order.code }} de {{ storeName }}</mj-text></mj-column></mj-section></mj-body></mjml>',
  );
}, 120_000);

afterAll(async () => {
  await server.destroy();
});

describe('order emails carry the name of the store (PRD 6.3, V9)', () => {
  it('are sent in the name of each store from the platform address', async () => {
    const orderA = await placeOrder(bakery, 'ana@example.test');
    const orderB = await placeOrder(bookshop, 'beto@example.test');

    const fromBakery = await emailWhere(
      (e) => e.recipient === 'ana@example.test' && e.body.includes(orderA),
    );
    const fromBookshop = await emailWhere(
      (e) => e.recipient === 'beto@example.test' && e.body.includes(orderB),
    );

    expect(fromBakery.from).toBe('"Panadería Don Juan" <no-reply@plataforma.test>');
    expect(fromBookshop.from).toBe('"Librería Luna" <no-reply@plataforma.test>');
  });

  it('use the template of the store when it has one, and the platform one otherwise (V9)', async () => {
    const orderA = await placeOrder(bakery, 'ana2@example.test');
    const orderB = await placeOrder(bookshop, 'beto2@example.test');

    const bakeryMail = await emailWhere(
      (e) => e.recipient === 'ana2@example.test' && e.body.includes(orderA),
    );
    const bookshopMail = await emailWhere((e) => e.recipient === 'beto2@example.test');

    expect(bookshopMail.body).toContain(`TEMPLATE-DE-LUNA pedido ${orderB} de Librería Luna`);
    expect(bakeryMail.body).not.toContain('TEMPLATE-DE-LUNA');
    expect(bakeryMail.body).toContain(orderA); // Vendure's standard confirmation
  });
});

describe('account emails belong to the platform (PRD 6.3)', () => {
  const register = (store: Store, email: string) => {
    shopClient.setChannelToken(store.token);
    return shopClient.asAnonymousUser().then(() =>
      shopClient.query(
        gql`
          mutation ($input: RegisterCustomerInput!) {
            registerCustomerAccount(input: $input) {
              ... on Success {
                success
              }
              ... on ErrorResult {
                message
              }
            }
          }
        `,
        {
          input: {
            emailAddress: email,
            password: 'una-clave-larga-1',
            firstName: 'Nueva',
            lastName: 'Cuenta',
          },
        },
      ),
    );
  };

  it('come in the name of the platform, not of the store, with a link to that store', async () => {
    await register(bakery, 'cuenta-a@example.test');

    const mail = await emailWhere((e) => e.recipient === 'cuenta-a@example.test');

    expect(mail.from).toBe('"La Plataforma" <no-reply@plataforma.test>');
    expect(mail.body).toContain('https://panaderia.example.test/account/verify?token=');
  });

  it('link to the platform when the store has no storefront URL yet', async () => {
    await register(bookshop, 'cuenta-b@example.test');

    const mail = await emailWhere((e) => e.recipient === 'cuenta-b@example.test');

    expect(mail.from).toBe('"La Plataforma" <no-reply@plataforma.test>');
    expect(mail.body).toContain('https://plataforma.test/account/verify?token=');
  });
});

describe('attention emails (PRD 9.4, 9.8)', () => {
  const publish = (event: MercadoPagoAttentionEvent) => server.app.get(EventBus).publish(event);

  it('tell the owners of the store about a payment that needs review, and nobody else', async () => {
    await publish(
      new MercadoPagoAttentionEvent('amount_mismatch', bakery.channelId, {
        orderCode: 'ORDEN-77',
        mpPaymentId: '555001',
        message: 'amount_mismatch',
      }),
    );

    const mail = await emailWhere((e) => e.body.includes('555001'));

    expect(mail.recipient).toBe(bakery.ownerEmail);
    expect(mail.from).toBe('"La Plataforma" <no-reply@plataforma.test>');
    expect(mail.subject).toBe(
      'Atención en Panadería Don Juan: Un pago aprobado no coincide con el pedido',
    );
    expect(mail.body).toContain('ORDEN-77');
    expect(mail.bcc).toBeUndefined(); // payment matters concern the store, not the platform
    expect(
      emails.some((e) => e.recipient === bookshop.ownerEmail && e.body.includes('555001')),
    ).toBe(false);
  });

  it('also tell the platform operators when the connection of a store breaks', async () => {
    const connections = server.app.get(MercadoPagoConnectionService);
    await connections.link(bookshop.channelId as number, {
      access_token: 'APP_USR-x',
      refresh_token: 'TG-x',
      user_id: 991,
      expires_in: 1000,
      scope: 'offline_access',
    });

    await connections.markDisconnected(
      (await connections.findActiveAccount(bookshop.channelId as number))!.id,
      'revoked',
    );

    const mail = await emailWhere(
      (e) =>
        e.subject.includes('Mercado Pago quedó desconectada') &&
        e.recipient === bookshop.ownerEmail,
    );
    expect(mail.bcc).toContain('ops@plataforma.test');
    expect(mail.body).toContain('Ajustes');
  });

  it('tell the store and the platform when Mercado Pago does not confirm who collected a payment', async () => {
    await publish(
      new MercadoPagoAttentionEvent('collector_mismatch', bakery.channelId, {
        orderCode: 'ORDEN-88',
        mpPaymentId: '555002',
        mpUserId: '1234',
      }),
    );

    const mail = await emailWhere((e) => e.body.includes('555002'));

    expect(mail.recipient).toBe(bakery.ownerEmail);
    expect(mail.bcc).toContain('ops@plataforma.test');
    expect(mail.subject).toBe(
      'Atención en Panadería Don Juan: Un pago aprobado no se pudo asignar a la cuenta que lo cobró',
    );
  });

  it('tell only the store when an old account is released: it is information, not a problem', async () => {
    await publish(
      new MercadoPagoAttentionEvent('link_released', bakery.channelId, {
        mpUserId: '987654',
        message: 'released 987654',
      }),
    );

    const mail = await emailWhere((e) => e.body.includes('987654'));

    expect(mail.recipient).toBe(bakery.ownerEmail);
    expect(mail.bcc).toBeUndefined();
    expect(mail.subject).toContain('Se liberó una cuenta de Mercado Pago anterior');
  });

  it('tell only the platform about a notification no store can be told about', async () => {
    await publish(
      new MercadoPagoAttentionEvent('unverifiable_payment', null, {
        mpPaymentId: '555003',
        mpUserId: '424242',
        message: 'no account',
      }),
    );

    const mail = await emailWhere((e) => e.body.includes('555003'));

    expect(mail.recipient).toContain('ops@plataforma.test');
    expect(mail.recipient).not.toContain(bakery.ownerEmail);
    expect(mail.subject).toBe(
      'Atención en La Plataforma: No se pudo verificar una notificación de Mercado Pago',
    );
  });
});

describe('sender names', () => {
  it('cannot be used to inject headers or break the address', () => {
    expect(formatSender('Mi "Tienda" <x>\r\nBcc: a@b.test', 'no-reply@plataforma.test')).toBe(
      '"Mi Tienda xBcc: a@b.test" <no-reply@plataforma.test>',
    );
    expect(addressOf('La Plataforma <no-reply@plataforma.test>')).toBe('no-reply@plataforma.test');
    expect(addressOf('no-reply@plataforma.test')).toBe('no-reply@plataforma.test');
    void TEST_PLATFORM;
    void E2E_DEFAULT_CHANNEL_TOKEN;
  });
});
