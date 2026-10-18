import { defineConfig, devices } from '@playwright/test';

const BACKEND_URL = 'http://localhost:3300';
const STOREFRONT_URL = 'http://localhost:3301';

/**
 * Runs the reference storefront against a real Vendure backend with a simulated Mercado Pago
 * (see e2e/backend/start.ts). `npm run build` must have been run before.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  // One backend with shared state: tests create their own carts but run one at a time.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: STOREFRONT_URL,
    locale: 'es-AR',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run e2e:backend',
      url: `${BACKEND_URL}/health`,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next start --port 3301',
      url: STOREFRONT_URL,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        VENDURE_SHOP_API_URL: `${BACKEND_URL}/shop-api`,
        VENDURE_CHANNEL_TOKEN: 'e2e-tienda-token',
        STOREFRONT_PUBLIC_URL: STOREFRONT_URL,
        STORE_NAME: 'Tienda E2E',
        // Short, so the "late webhook" case does not make the suite slow.
        PAYMENT_SYNC_AFTER_MS: '2500',
        // The tests run over plain http on localhost.
        INSECURE_COOKIES: '1',
      },
    },
  ],
});
