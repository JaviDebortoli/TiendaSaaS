import { expect, test } from '@playwright/test';
import { addFirstProduct, paymentTitle } from './helpers';

test.describe('what the browser can and cannot see', () => {
  test('keeps the session in an httpOnly cookie and out of the page', async ({ page, context }) => {
    await addFirstProduct(page);

    const session = (await context.cookies()).find((c) => c.name === 'store_session');
    expect(session, 'the session cookie exists').toBeTruthy();
    expect(session!.httpOnly).toBe(true);
    expect(session!.sameSite).toBe('Lax');
    expect(await page.content()).not.toContain(session!.value);
  });

  test('never exposes Mercado Pago credentials', async ({ page }) => {
    const bodies: string[] = [];
    page.on('response', async (response) => {
      const type = response.headers()['content-type'] ?? '';
      if (/html|json|javascript/.test(type)) bodies.push(await response.text().catch(() => ''));
    });
    await addFirstProduct(page);
    await page.goto('/checkout/pay');
    await page.goto('/account');

    const everything = bodies.join('\n');
    expect(everything).not.toMatch(/APP_USR|TG-e2e|test-client-secret|access_token/);
  });
});

test.describe('the result page does not believe the URL', () => {
  test('"status=approved" for an order that does not exist confirms nothing', async ({ page }) => {
    await page.goto(
      '/checkout/result?status=approved&collection_status=approved&payment_id=1&external_reference=NOSUCHORDER',
    );

    await expect(paymentTitle(page)).toHaveText(/Procesando/);
    // Give it time to run the server-side check as well.
    await page.waitForTimeout(5000);
    await expect(paymentTitle(page)).not.toHaveText('¡Pago confirmado!');
  });

  test('without any order or reference it keeps saying "procesando" instead of inventing one', async ({
    page,
  }) => {
    await page.goto('/checkout/result?status=approved');

    // Nothing identifies an order or a payment: there is nothing to ask, and the webhook settles it.
    await expect(paymentTitle(page)).toHaveText(/Procesando/);
    await expect(page.getByTestId('order-code')).toHaveCount(0);
    await expect(paymentTitle(page)).not.toHaveText('¡Pago confirmado!');
  });

  test('a reference that looks like an order code is not read as one', async ({ page }) => {
    // The text of the reference is never turned into an order: with no session order and nothing the
    // server knows, nothing is confirmed and no order is shown.
    await page.goto(
      '/checkout/result?status=approved&payment_id=1&external_reference=ABCDEF123456-AAAAAAAAAAAAAAAAAAAAAA',
    );
    await page.waitForTimeout(3000);

    await expect(paymentTitle(page)).toHaveText(/Procesando/);
    await expect(page.getByTestId('order-code')).toHaveCount(0);
  });

  test('the status endpoint rejects malformed parameters', async ({ request }) => {
    expect((await request.get('/api/payment-status?order=../x')).status()).toBe(400);
    expect(
      (await request.get('/api/payment-status?order=ABC123&paymentId=../../users/me')).status(),
    ).toBe(400);
    expect((await request.get('/api/payment-status')).status()).toBe(400);
    // A payment to check needs both pointers, and the reference only has its own alphabet.
    expect((await request.get('/api/payment-status?paymentId=1')).status()).toBe(400);
    expect((await request.get('/api/payment-status?externalReference=ABC-DEF')).status()).toBe(400);
    expect(
      (await request.get('/api/payment-status?externalReference=../x&paymentId=1')).status(),
    ).toBe(400);
  });
});
