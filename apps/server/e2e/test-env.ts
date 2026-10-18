import { LanguageCode, mergeConfig } from '@vendure/core';
import {
  createTestEnvironment,
  E2E_DEFAULT_CHANNEL_TOKEN,
  registerInitializer,
  SqljsInitializer,
  testConfig,
} from '@vendure/testing';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { MercadoPagoPlugin } from 'vendure-plugin-mercadopago';
import { PlatformPlugin } from '../src/platform/platform.plugin';

registerInitializer('sqljs', new SqljsInitializer(path.join(__dirname, '__data__')));

export { E2E_DEFAULT_CHANNEL_TOKEN };

export function createPlatformTestEnvironment(port: number) {
  const env = createTestEnvironment(
    mergeConfig(
      { ...testConfig, apiOptions: { ...testConfig.apiOptions, port }, plugins: [] },
      {
        plugins: [
          PlatformPlugin.init({ ensureBaseData: false }),
          MercadoPagoPlugin.init({
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            webhookSecret: 'test-webhook-secret',
            redirectUri: 'https://platform.example.test/mercadopago/oauth/callback',
            tokenEncryptionKey: randomBytes(32).toString('base64'),
            publicUrl: 'https://platform.example.test',
            dashboardUrl: 'https://platform.example.test/dashboard',
          }),
        ],
      },
    ),
  );
  return {
    ...env,
    port,
    init: () =>
      env.server.init({
        initialData: {
          defaultLanguage: LanguageCode.en,
          defaultZone: 'Argentina',
          countries: [{ name: 'Argentina', code: 'AR', zone: 'Argentina' }],
          taxRates: [],
          shippingMethods: [],
          paymentMethods: [],
          collections: [],
        },
        productsCsvPath: path.join(__dirname, 'fixtures/products.csv'),
        customerCount: 1,
      }),
  };
}
