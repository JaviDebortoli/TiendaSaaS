import { LanguageCode, mergeConfig, Permission, VendureConfig } from '@vendure/core';
import {
  createTestEnvironment,
  registerInitializer,
  SimpleGraphQLClient,
  E2E_DEFAULT_CHANNEL_TOKEN,
  PostgresInitializer,
  SqljsInitializer,
  testConfig,
} from '@vendure/testing';
import gql from 'graphql-tag';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { MercadoPagoPlugin, MercadoPagoPluginOptions, manageMercadoPago } from '../src';
import { initialData } from './fixtures/initial-data';

registerInitializer('sqljs', new SqljsInitializer(path.join(__dirname, '__data__')));
registerInitializer('postgres', new PostgresInitializer());

/** PostgreSQL suites (concurrency, unique indexes) run only when a test database is configured. */
export const postgresAvailable = Boolean(process.env.TEST_DB_PASSWORD);

function postgresConfig(): Partial<VendureConfig> {
  return {
    dbConnectionOptions: {
      type: 'postgres',
      host: process.env.TEST_DB_HOST ?? 'localhost',
      port: Number(process.env.TEST_DB_PORT ?? 5432),
      username: process.env.TEST_DB_USERNAME ?? 'tiendasaas',
      password: process.env.TEST_DB_PASSWORD,
      database: 'postgres',
    },
  };
}

export const TEST_OPTIONS: MercadoPagoPluginOptions = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  webhookSecret: 'test-webhook-secret',
  redirectUri: 'https://platform.example.test/mercadopago/oauth/callback',
  tokenEncryptionKey: randomBytes(32).toString('base64'),
  publicUrl: 'https://platform.example.test',
  dashboardUrl: 'https://platform.example.test/dashboard',
  oauthTestToken: true,
};

export function createMpTestEnvironment(
  port: number,
  options: Partial<MercadoPagoPluginOptions> = {},
  config: Partial<VendureConfig> = {},
  db: 'sqljs' | 'postgres' = 'sqljs',
) {
  const env = createTestEnvironment(
    mergeConfig(
      {
        ...testConfig,
        apiOptions: { ...testConfig.apiOptions, port },
        plugins: [],
      },
      {
        ...config,
        ...(db === 'postgres' ? postgresConfig() : {}),
        plugins: [
          MercadoPagoPlugin.init({ ...TEST_OPTIONS, ...options }),
          ...(config.plugins ?? []),
        ],
      },
    ),
  );
  return {
    ...env,
    port,
    init: () =>
      env.server.init({
        initialData,
        productsCsvPath: path.join(__dirname, 'fixtures/products.csv'),
        customerCount: 1,
      }),
  };
}

export interface TestStore {
  /** Database id (the test id strategy encodes API ids as `T_<n>`). */
  channelId: number;
  /** Id as the GraphQL APIs expose it. */
  apiChannelId: string;
  token: string;
  adminEmail: string;
  adminPassword: string;
  sellerId: string;
}

const STORE_PERMISSIONS = [
  manageMercadoPago.Permission,
  Permission.ReadOrder,
  Permission.UpdateOrder,
  Permission.CreateOrder,
  Permission.ReadCatalog,
  Permission.ReadPaymentMethod,
  Permission.ReadSettings,
];

/** Creates seller + channel + channel-scoped role and administrator, like PRD 5.4 does. */
export async function createStore(
  adminClient: SimpleGraphQLClient,
  code: string,
  options: { storefrontUrl?: string; permissions?: string[] } = {},
): Promise<TestStore> {
  await adminClient.asSuperAdmin();
  const { zones } = await adminClient.query<{ zones: { items: { id: string; name: string }[] } }>(
    gql`
      query {
        zones {
          items {
            id
            name
          }
        }
      }
    `,
  );
  const zoneId = zones.items.find((z) => z.name === 'Argentina')!.id;

  const { createSeller } = await adminClient.query<{ createSeller: { id: string } }>(
    gql`
      mutation ($input: CreateSellerInput!) {
        createSeller(input: $input) {
          id
        }
      }
    `,
    { input: { name: `Seller ${code}` } },
  );
  const token = `${code}-token`;
  const { createChannel } = await adminClient.query<{ createChannel: { id: string } }>(
    gql`
      mutation ($input: CreateChannelInput!) {
        createChannel(input: $input) {
          ... on Channel {
            id
          }
          ... on LanguageNotAvailableError {
            message
          }
        }
      }
    `,
    {
      input: {
        code,
        token,
        defaultLanguageCode: LanguageCode.en,
        availableLanguageCodes: [LanguageCode.en],
        pricesIncludeTax: true,
        currencyCode: 'ARS',
        defaultCurrencyCode: 'ARS',
        availableCurrencyCodes: ['ARS'],
        defaultTaxZoneId: zoneId,
        defaultShippingZoneId: zoneId,
        sellerId: createSeller.id,
        customFields: options.storefrontUrl
          ? { mpStorefrontUrl: options.storefrontUrl }
          : undefined,
      },
    },
  );
  const { createRole } = await adminClient.query<{ createRole: { id: string } }>(
    gql`
      mutation ($input: CreateRoleInput!) {
        createRole(input: $input) {
          id
        }
      }
    `,
    {
      input: {
        code: `${code}-owner`,
        description: `Owner of ${code}`,
        permissions: options.permissions ?? STORE_PERMISSIONS,
        channelIds: [createChannel.id],
      },
    },
  );
  const adminEmail = `owner@${code}.test`;
  const adminPassword = `${code}-password`;
  await adminClient.query(
    gql`
      mutation ($input: CreateAdministratorInput!) {
        createAdministrator(input: $input) {
          id
        }
      }
    `,
    {
      input: {
        firstName: 'Owner',
        lastName: code,
        emailAddress: adminEmail,
        password: adminPassword,
        roleIds: [createRole.id],
      },
    },
  );
  return {
    channelId: Number(createChannel.id.replace(/^T_/, '')),
    apiChannelId: createChannel.id,
    token,
    adminEmail,
    adminPassword,
    sellerId: createSeller.id,
  };
}

/** Signs in as the store's administrator, scoped to its channel. */
export async function asStoreAdmin(adminClient: SimpleGraphQLClient, store: TestStore) {
  adminClient.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN);
  await adminClient.asUserWithCredentials(store.adminEmail, store.adminPassword);
  adminClient.setChannelToken(store.token);
}

export function asSuperAdmin(adminClient: SimpleGraphQLClient) {
  adminClient.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN);
  return adminClient.asSuperAdmin();
}
