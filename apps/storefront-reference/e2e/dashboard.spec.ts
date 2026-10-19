import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * The store owner's side: the Vendure dashboard, scoped to one store, with the Mercado Pago page
 * the plugin adds. Needs the dashboard to be built: `npm run build:dashboard -w @tiendasaas/server`.
 */
const dashboardBuilt = existsSync(
  path.resolve(__dirname, '../../server/dist/dashboard/index.html'),
);
test.skip(
  !dashboardBuilt,
  'Build the dashboard first: npm run build:dashboard -w @tiendasaas/server',
);

const DASHBOARD = 'http://localhost:3300/dashboard';

const REVOKE_WARNING =
  'No revoques el acceso de esta cuenta desde Mercado Pago durante 180 días. Si lo hacés, los reembolsos de las ventas cobradas en ella vas a tener que hacerlos desde el panel de Mercado Pago.';

async function signInAsOwner(page: import('@playwright/test').Page) {
  await page.goto(`${DASHBOARD}/login`);
  await page.getByRole('textbox', { name: 'Email' }).fill('dueno@e2e.test');
  await page.getByRole('textbox', { name: 'Password' }).fill('e2e-owner-password-1');
  await page.getByRole('button', { name: /^(log ?in|sign ?in)/i }).click();
  await expect(page).not.toHaveURL(/login/);
}

test('the owner signs in and works inside their own store only', async ({ page }) => {
  await signInAsOwner(page);

  // The store of the owner is the only channel they can reach.
  const me = await page.evaluate(async () => {
    const token = localStorage.getItem('vendure-session-token');
    const response = await fetch('/admin-api', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Apollo-Require-Preflight': 'true',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query: '{ me { channels { code } } }' }),
    });
    return (await response.json()) as { data: { me: { channels: { code: string }[] } } };
  });
  expect(me.data.me.channels.map((c) => c.code)).toEqual(['e2e-tienda']);
});

test('the Mercado Pago page shows the connection and starts the authorization on Mercado Pago', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`${DASHBOARD}/mercado-pago`);

  await expect(page.getByRole('heading', { name: 'Mercado Pago' }).first()).toBeVisible();
  await expect(page.getByText('Conectada', { exact: true })).toBeVisible();
  await expect(page.getByText(/Cuenta de Mercado Pago n\.º 7777/)).toBeVisible();

  // The warning is shown, and again in the confirmation, before changing the account.
  await expect(page.getByText(REVOKE_WARNING)).toBeVisible();

  // Mercado Pago itself is not reachable from the tests: capture where the owner is sent.
  await page.route('https://auth.mercadopago.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Mercado Pago</h1>' }),
  );
  // `confirm` blocks the click until it is answered, so the handler goes first.
  let confirmation = '';
  page.once('dialog', (dialog) => {
    confirmation = dialog.message();
    void dialog.accept();
  });
  await page.getByRole('button', { name: 'Vincular otra cuenta' }).click();
  expect(confirmation).toContain(REVOKE_WARNING);
  await page.waitForURL(/auth\.mercadopago\.com\/authorization/);

  const url = new URL(page.url());
  expect(url.searchParams.get('client_id')).toBe('test-client-id');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(url.toString()).not.toContain('test-client-secret');
});

test('the Mercado Pago page lists the accounts the store used before and when they are released', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`${DASHBOARD}/mercado-pago`);

  await expect(page.getByText('Cuentas anteriores', { exact: true })).toBeVisible();
  const previous = page.getByRole('listitem').filter({ hasText: 'n.º 7000' });
  await expect(previous).toBeVisible();
  await expect(previous).toContainText('Anterior');
  await expect(previous).toContainText('Sus ventas todavía se pueden reembolsar desde acá.');
  await expect(previous).toContainText('Se liberará a partir del');
});

test('unlinking asks first, with the warning, and does nothing if the owner backs out', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`${DASHBOARD}/mercado-pago`);

  let confirmation = '';
  page.once('dialog', (dialog) => {
    confirmation = dialog.message();
    void dialog.dismiss(); // the store must stay linked: other tests sell with it
  });
  await page.getByRole('button', { name: 'Desvincular' }).click();
  expect(confirmation).toContain(REVOKE_WARNING);

  await expect(page.getByText('Conectada', { exact: true })).toBeVisible();
});

test('the page explains the result when Mercado Pago sends the owner back', async ({ page }) => {
  await signInAsOwner(page);

  await page.goto(`${DASHBOARD}/mercado-pago?mp=error&reason=account_already_linked`);

  await expect(
    page.getByText('Esa cuenta de Mercado Pago ya está vinculada a otra tienda.'),
  ).toBeVisible();
});

test('the scoped owner role is enough for daily work: products, orders and delivery methods load', async ({
  page,
}) => {
  await signInAsOwner(page);
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.url().endsWith('/admin-api') && response.status() >= 400) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && /not currently authorized|FORBIDDEN/i.test(message.text())) {
      failures.push(message.text());
    }
  });

  await page.goto(`${DASHBOARD}/products`);
  await expect(page.getByText('Alpha Mug')).toBeVisible();
  await page.goto(`${DASHBOARD}/orders`);
  await expect(page.getByRole('heading', { name: 'Orders' }).first()).toBeVisible();
  await page.goto(`${DASHBOARD}/shipping-methods`);
  await expect(page.getByText('Retiro en el local')).toBeVisible();

  expect(failures).toEqual([]);
});
