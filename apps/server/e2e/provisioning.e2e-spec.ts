import { RequestContextService } from '@vendure/core';
import { SimpleGraphQLClient } from '@vendure/testing';
import gql from 'graphql-tag';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BaseDataService } from '../src/platform/platform.plugin';
import { createPlatformTestEnvironment, E2E_DEFAULT_CHANNEL_TOKEN } from './test-env';

const { server, adminClient, shopClient, init } = createPlatformTestEnvironment(3201);

const PROVISION = gql`
  mutation ($input: ProvisionStoreInput!) {
    provisionStore(input: $input) {
      sellerId
      channelId
      channelCode
      token
      administratorEmail
      generatedPassword
      stockLocationId
      shippingMethodIds
      paymentMethodId
    }
  }
`;

interface Provisioned {
  sellerId: string;
  channelId: string;
  channelCode: string;
  token: string;
  administratorEmail: string;
  generatedPassword: string | null;
  stockLocationId: string;
  shippingMethodIds: string[];
  paymentMethodId: string;
}

const owner = (code: string) => ({
  ownerEmail: `owner@${code}.test`,
  ownerFirstName: 'Owner',
  ownerLastName: code,
});

async function asSuperAdmin() {
  adminClient.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN);
  await adminClient.asSuperAdmin();
}

async function provision(input: Record<string, unknown>): Promise<Provisioned> {
  await asSuperAdmin();
  const { provisionStore } = await adminClient.query<{ provisionStore: Provisioned }>(PROVISION, {
    input,
  });
  return provisionStore;
}

async function asOwner(
  store: Provisioned,
  password: string,
  client: SimpleGraphQLClient = adminClient,
) {
  client.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN);
  await client.asUserWithCredentials(store.administratorEmail, password);
  client.setChannelToken(store.token);
}

let storeA: Provisioned;
let storeB: Provisioned;
const PASSWORD_B = 'owner-b-password-123';

beforeAll(async () => {
  await init();
  // The initial data above stands in for a database that already has Argentina; the base data
  // service must adopt it, not duplicate it.
  await server.app
    .get(BaseDataService)
    .ensure(await server.app.get(RequestContextService).create({ apiType: 'admin' }));
  storeA = await provision({
    name: 'Panadería Don Juan',
    code: 'panaderia',
    storefrontUrl: 'https://panaderia.example.test',
    ...owner('panaderia'),
    flatRate: 150000,
    flatRateMinimum: 500000,
    cuit: '30-12345678-9',
    contactEmail: 'hola@panaderia.test',
  });
  storeB = await provision({
    name: 'Librería Luna',
    code: 'libreria',
    ...owner('libreria'),
    ownerPassword: PASSWORD_B,
    flatRate: 123456,
  });
}, 120_000);

afterAll(async () => {
  await server.destroy();
});

describe('provisionStore (PRD 5.4)', () => {
  it('creates seller, channel, owner, stock location, delivery and payment methods in one go', async () => {
    expect(storeA).toMatchObject({
      channelCode: 'panaderia',
      administratorEmail: 'owner@panaderia.test',
    });
    expect(storeA.token).toMatch(/^[A-Za-z0-9_-]{8,}$/);
    expect(storeA.shippingMethodIds).toHaveLength(2);

    await asSuperAdmin();
    const { channels } = await adminClient.query(gql`
      query {
        channels {
          items {
            code
            token
            pricesIncludeTax
            defaultCurrencyCode
            availableCurrencyCodes
            defaultLanguageCode
            seller {
              name
              customFields {
                cuit
                contactEmail
              }
            }
            customFields {
              mpStorefrontUrl
            }
          }
        }
      }
    `);
    const channel = channels.items.find((c: { code: string }) => c.code === 'panaderia');
    expect(channel).toMatchObject({
      token: storeA.token,
      pricesIncludeTax: true,
      defaultCurrencyCode: 'ARS',
      availableCurrencyCodes: ['ARS'],
      defaultLanguageCode: 'es',
      seller: {
        name: 'Panadería Don Juan',
        customFields: { cuit: '30-12345678-9', contactEmail: 'hola@panaderia.test' },
      },
      customFields: { mpStorefrontUrl: 'https://panaderia.example.test' },
    });

    adminClient.setChannelToken(storeA.token);
    const { shippingMethods, paymentMethods, stockLocations } = await adminClient.query(gql`
      query {
        shippingMethods {
          items {
            code
            name
            checker {
              code
            }
            calculator {
              code
            }
          }
        }
        paymentMethods {
          items {
            code
            enabled
            handler {
              code
            }
            checker {
              code
            }
          }
        }
        stockLocations {
          items {
            name
          }
        }
      }
    `);
    expect(shippingMethods.items.map((m: { code: string }) => m.code).sort()).toEqual([
      'panaderia-flat-rate',
      'panaderia-pickup',
    ]);
    expect(paymentMethods.items).toEqual([
      {
        code: 'mercado-pago',
        enabled: true,
        handler: { code: 'mercado-pago' },
        checker: { code: 'mercado-pago-connected' },
      },
    ]);
    expect(stockLocations.items.map((l: { name: string }) => l.name)).toContain(
      'Panadería Don Juan',
    );
  });

  it('generates the owner password once and does not return it when the caller chose one', () => {
    expect(storeA.generatedPassword).toMatch(/^[A-Za-z0-9_-]{20}$/);
    expect(storeB.generatedPassword).toBeNull();
  });

  it('lets the owner sign in with the returned credentials', async () => {
    await asOwner(storeA, storeA.generatedPassword!);

    const { me } = await adminClient.query(gql`
      query {
        me {
          identifier
        }
      }
    `);

    expect(me.identifier).toBe('owner@panaderia.test');
  });

  it('keeps Argentina, VAT and ARS in place, once', async () => {
    await asSuperAdmin();
    const { zones, taxRates, countries } = await adminClient.query(gql`
      query {
        zones {
          items {
            name
          }
        }
        taxRates {
          items {
            name
            value
          }
        }
        countries {
          items {
            code
          }
        }
      }
    `);

    expect(zones.items.filter((z: { name: string }) => z.name === 'Argentina')).toHaveLength(1);
    expect(taxRates.items.filter((r: { value: number }) => r.value === 21)).toHaveLength(1);
    // Running the base data again changes nothing.
    const base = server.app.get(BaseDataService);
    await base.ensure(await server.app.get(RequestContextService).create({ apiType: 'admin' }));
    await base.ensure(await server.app.get(RequestContextService).create({ apiType: 'admin' }));
    const again = await adminClient.query(gql`
      query {
        zones {
          totalItems
        }
        taxRates {
          totalItems
        }
      }
    `);
    expect(again.zones.totalItems).toBe(zones.items.length);
    expect(again.taxRates.totalItems).toBe(taxRates.items.length);
    expect(countries.items.filter((c: { code: string }) => c.code === 'AR')).toHaveLength(1);
    const { activeChannel } = await adminClient.query(gql`
      query {
        activeChannel {
          defaultCurrencyCode
        }
      }
    `);
    expect(activeChannel.defaultCurrencyCode).toBe('ARS');
  });
});

describe('each administrator sees only their channel (PRD 5.3)', () => {
  it('shows only the channel of the owner where the dashboard looks (me.channels)', async () => {
    await asOwner(storeA, storeA.generatedPassword!);

    const { me } = await adminClient.query(gql`
      query {
        me {
          channels {
            code
          }
        }
      }
    `);

    expect(me.channels.map((c: { code: string }) => c.code)).toEqual(['panaderia']);
  });

  it('cannot list the channels, and with them the tokens, of the other stores', async () => {
    await asOwner(storeA, storeA.generatedPassword!);

    await expect(
      adminClient.query(gql`
        query {
          channels {
            items {
              token
            }
          }
        }
      `),
    ).rejects.toThrow(/not currently authorized/i);
    const { activeChannel } = await adminClient.query(gql`
      query {
        activeChannel {
          code
        }
      }
    `);
    expect(activeChannel.code).toBe('panaderia');
  });

  it('cannot list the other stores (names, tax ids, contacts) either', async () => {
    await asOwner(storeA, storeA.generatedPassword!);

    await expect(
      adminClient.query(gql`
        query {
          sellers {
            items {
              name
            }
          }
        }
      `),
    ).rejects.toThrow(/not currently authorized/i);
  });

  it('cannot work in another store or in the default channel', async () => {
    await asOwner(storeA, storeA.generatedPassword!);
    const products = gql`
      query {
        products {
          totalItems
        }
      }
    `;

    adminClient.setChannelToken(storeB.token);
    await expect(adminClient.query(products)).rejects.toThrow(
      /not currently authorized|forbidden/i,
    );

    adminClient.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN);
    await expect(adminClient.query(products)).rejects.toThrow(
      /not currently authorized|forbidden/i,
    );
  });

  it('does not see products created by another store or the ones of the default channel', async () => {
    await asOwner(storeB, PASSWORD_B);
    await adminClient.query(
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
              name: 'Libro de Luna',
              slug: 'libro-de-luna',
              description: 'Solo de Luna',
            },
          ],
        },
      },
    );
    await asOwner(storeA, storeA.generatedPassword!);

    const { products } = await adminClient.query(gql`
      query {
        products {
          items {
            name
          }
        }
      }
    `);

    expect(products.items).toEqual([]);
  });

  it('cannot administer the platform: no administrators, roles or channel creation', async () => {
    await asOwner(storeA, storeA.generatedPassword!);

    await expect(
      adminClient.query(gql`
        query {
          administrators {
            totalItems
          }
        }
      `),
    ).rejects.toThrow(/not currently authorized/i);
    await expect(
      adminClient.query(gql`
        query {
          roles {
            totalItems
          }
        }
      `),
    ).rejects.toThrow(/not currently authorized/i);
    await expect(
      adminClient.query(
        gql`
          mutation ($input: ProvisionStoreInput!) {
            provisionStore(input: $input) {
              token
            }
          }
        `,
        { input: { name: 'Sneaky', code: 'sneaky', ...owner('sneaky') } },
      ),
    ).rejects.toThrow(/not currently authorized/i);
  });

  it('gives the owner the Mercado Pago permission only for their own channel', async () => {
    await asOwner(storeA, storeA.generatedPassword!);

    const { mercadoPagoConnection } = await adminClient.query(gql`
      query {
        mercadoPagoConnection {
          status
        }
      }
    `);

    expect(mercadoPagoConnection).toBeNull(); // allowed, and nothing linked yet
  });
});

describe('provisioning is atomic and validated', () => {
  const count = async (query: string, key: string) => {
    await asSuperAdmin();
    const result = await adminClient.query(gql(query));
    return result[key].totalItems as number;
  };

  it('leaves nothing behind when a late step fails (duplicate owner email)', async () => {
    const before = {
      channels: await count('query { channels { totalItems } }', 'channels'),
      roles: await count('query { roles { totalItems } }', 'roles'),
      admins: await count('query { administrators { totalItems } }', 'administrators'),
    };

    await asSuperAdmin();
    await expect(
      adminClient.query(PROVISION, {
        input: {
          name: 'Duplicada',
          code: 'duplicada',
          ownerEmail: 'owner@panaderia.test',
          ownerFirstName: 'X',
          ownerLastName: 'Y',
        },
      }),
    ).rejects.toThrow(/already exists/);

    expect(await count('query { channels { totalItems } }', 'channels')).toBe(before.channels);
    expect(await count('query { roles { totalItems } }', 'roles')).toBe(before.roles);
    expect(await count('query { administrators { totalItems } }', 'administrators')).toBe(
      before.admins,
    );
    const { sellers } = await adminClient.query(gql`
      query {
        sellers {
          items {
            name
          }
        }
      }
    `);
    expect(sellers.items.map((s: { name: string }) => s.name)).not.toContain('Duplicada');
  });

  it('uses the token it is given', async () => {
    const store = await provision({
      name: 'Con token',
      code: 'con-token',
      token: 'my-fixed-token',
      ...owner('con-token'),
    });

    expect(store.token).toBe('my-fixed-token');
  });

  it.each([
    ['a duplicate channel code', { code: 'panaderia' }, /code "panaderia" already exists/],
    ['a duplicate token', { token: 'my-fixed-token', code: 'otra-1' }, /token is already in use/],
    ['an invalid code', { code: 'Not Valid!' }, /code must be/],
    [
      'a local storefront URL',
      { code: 'otra-2', storefrontUrl: 'http://localhost:3001' },
      /public https URL/,
    ],
    [
      'an http storefront URL',
      { code: 'otra-3', storefrontUrl: 'http://tienda.example.test' },
      /public https URL/,
    ],
    ['a short password', { code: 'otra-4', ownerPassword: 'short' }, /at least 10/],
    ['a negative flat rate', { code: 'otra-5', flatRate: -1 }, /non-negative integer/],
    [
      'a fractional flat rate',
      { code: 'otra-6', flatRate: 10.5 },
      /Int cannot represent|non-negative integer/,
    ],
    ['an invalid email', { code: 'otra-7', ownerEmail: 'not-an-email' }, /valid email/],
  ])('rejects %s', async (_label, override, message) => {
    await asSuperAdmin();
    await expect(
      adminClient.query(PROVISION, {
        input: { name: 'Otra', ...owner('otra'), ...override },
      }),
    ).rejects.toThrow(message);
  });
});

describe('delivery methods (PRD 8, V8)', () => {
  /** Adds the first variant of the store's catalogue and returns the eligible shipping methods. */
  async function eligibleFor(
    store: Provisioned,
    password: string | null,
    countryCode: string,
    quantity = 1,
  ) {
    await asOwner(store, password ?? PASSWORD_B);
    // The owner publishes one product, and the shop API can then sell it.
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
              name: `Item ${Math.random()}`,
              slug: `item-${Math.random().toString(36).slice(2)}`,
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
            sku: `SKU-${Math.random().toString(36).slice(2)}`,
            price: 100000,
            stockOnHand: 100,
            translations: [{ languageCode: 'es', name: 'Variante' }],
          },
        ],
      },
    );
    shopClient.setChannelToken(store.token);
    await shopClient.asAnonymousUser();
    await shopClient.query(
      gql`
        mutation ($id: ID!, $q: Int!) {
          addItemToOrder(productVariantId: $id, quantity: $q) {
            ... on Order {
              id
            }
          }
        }
      `,
      { id: createProductVariants[0].id, q: quantity },
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
      { input: { fullName: 'Buyer', streetLine1: 'Calle 1', city: 'Ciudad', countryCode } },
    );
    const { eligibleShippingMethods } = await shopClient.query(gql`
      query {
        eligibleShippingMethods {
          code
          price
          priceWithTax
        }
      }
    `);
    return eligibleShippingMethods as { code: string; price: number; priceWithTax: number }[];
  }

  it('pickup is free and always eligible, delivery is not offered below its minimum', async () => {
    const methods = await eligibleFor(storeA, storeA.generatedPassword, 'AR', 1);

    expect(methods.map((m) => m.code)).toEqual(['panaderia-pickup']);
    expect(methods[0]).toMatchObject({ price: 0, priceWithTax: 0 });
  });

  it('delivery appears once the minimum is reached, at exactly the configured fee', async () => {
    const methods = await eligibleFor(storeA, storeA.generatedPassword, 'AR', 6); // 6 x 1000.00 >= 5000.00

    const flat = methods.find((m) => m.code === 'panaderia-flat-rate')!;
    expect(flat).toMatchObject({ price: 150000, priceWithTax: 150000 });
  });

  it('the flat fee does not depend on the order (V8): 123456 stays 123456 for any cart', async () => {
    for (const quantity of [1, 3, 7]) {
      const methods = await eligibleFor(storeB, null, 'AR', quantity);
      expect(methods.find((m) => m.code === 'libreria-flat-rate')).toMatchObject({
        price: 123456,
        priceWithTax: 123456,
      });
    }
  });

  it('delivery is not offered outside the delivery zone', async () => {
    await asSuperAdmin();
    await adminClient.query(
      gql`
        mutation ($input: CreateCountryInput!) {
          createCountry(input: $input) {
            id
          }
        }
      `,
      {
        input: {
          code: 'UY',
          enabled: true,
          translations: [{ languageCode: 'es', name: 'Uruguay' }],
        },
      },
    );
    const methods = await eligibleFor(storeB, null, 'UY', 1);

    expect(methods.map((m) => m.code)).toEqual(['libreria-pickup']);
  });
});

describe('the default channel stays out of reach of the storefronts (PRD 5.2)', () => {
  it('a store token only ever returns that store catalogue', async () => {
    shopClient.setChannelToken(storeA.token);
    await shopClient.asAnonymousUser();

    const { products } = await shopClient.query(gql`
      query {
        products {
          items {
            name
          }
        }
      }
    `);

    expect(products.items.map((p: { name: string }) => p.name)).not.toContain('Default Product');
  });
});

describe('a delivery method that stops being eligible before payment (PRD 9.6 step 1, V11)', () => {
  it('is swapped for one that qualifies, with no error (V11): storefronts must show the current method', async () => {
    // storeA: delivery needs at least $5.000,00. A cart above it qualifies...
    await asOwner(storeA, storeA.generatedPassword!);
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
              name: 'Torta grande',
              slug: `torta-${Date.now()}`,
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
            sku: `TORTA-${Date.now()}`,
            price: 100000,
            stockOnHand: 100,
            translations: [{ languageCode: 'es', name: 'Torta grande' }],
          },
        ],
      },
    );
    shopClient.setChannelToken(storeA.token);
    await shopClient.asAnonymousUser();
    const { addItemToOrder } = await shopClient.query(
      gql`
        mutation ($id: ID!) {
          addItemToOrder(productVariantId: $id, quantity: 6) {
            ... on Order {
              lines {
                id
              }
            }
          }
        }
      `,
      { id: createProductVariants[0].id },
    );
    const lineId = addItemToOrder.lines[0].id;
    await shopClient.query(gql`
      mutation {
        setCustomerForOrder(
          input: { emailAddress: "uno@example.test", firstName: "U", lastName: "No" }
        ) {
          ... on Order {
            id
          }
        }
      }
    `);
    await shopClient.query(gql`
      mutation {
        setOrderShippingAddress(
          input: { fullName: "Uno", streetLine1: "Calle 1", city: "Rosario", countryCode: "AR" }
        ) {
          ... on Order {
            id
          }
        }
      }
    `);
    const { eligibleShippingMethods } = await shopClient.query(gql`
      query {
        eligibleShippingMethods {
          id
          code
        }
      }
    `);
    const flat = eligibleShippingMethods.find(
      (m: { code: string }) => m.code === 'panaderia-flat-rate',
    );
    expect(flat).toBeDefined();
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
      { id: [flat.id] },
    );

    // ...and the buyer lowers the quantity below the minimum before paying.
    await shopClient.query(
      gql`
        mutation ($id: ID!) {
          adjustOrderLine(orderLineId: $id, quantity: 1) {
            ... on Order {
              id
            }
          }
        }
      `,
      { id: lineId },
    );
    // Vendure does not raise an error: as soon as the order changes it swaps a delivery method
    // that no longer qualifies for the first one that does (here: pickup, free).
    const { activeOrder } = await shopClient.query(gql`
      query {
        activeOrder {
          shippingWithTax
          shippingLines {
            shippingMethod {
              code
            }
          }
        }
      }
    `);
    expect(
      activeOrder.shippingLines.map(
        (l: { shippingMethod: { code: string } }) => l.shippingMethod.code,
      ),
    ).toEqual(['panaderia-pickup']);
    expect(activeOrder.shippingWithTax).toBe(0);

    // Moving to payment then succeeds with the new, current delivery method.
    const { transitionOrderToState } = await shopClient.query(gql`
      mutation {
        transitionOrderToState(state: "ArrangingPayment") {
          __typename
          ... on Order {
            state
          }
        }
      }
    `);
    expect(transitionOrderToState).toEqual({ __typename: 'Order', state: 'ArrangingPayment' });
  });
});
