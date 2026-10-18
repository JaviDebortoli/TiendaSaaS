import { expect, test } from '@playwright/test';
import {
  addFirstProduct,
  chooseDelivery,
  fillDetails,
  goToMercadoPago,
  paymentTitle,
} from './helpers';

test.describe('guest purchase with Mercado Pago', () => {
  test('browse, buy and see the payment confirmed by the server', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Carrito \(0\)/ })).toBeVisible();

    const product = await addFirstProduct(page);
    await expect(page.getByRole('link', { name: product })).toBeVisible();
    await expect(page.getByRole('link', { name: /Carrito \(1\)/ })).toBeVisible();

    await goToMercadoPago(page);
    await page.locator('#approve').click();

    await expect(paymentTitle(page)).toHaveText('¡Pago confirmado!');
    await expect(page.getByTestId('order-code')).toHaveText(/^[A-Z0-9]{4,}$/);
    // The cart became an order.
    await page.goto('/cart');
    await expect(page.getByText('Tu carrito está vacío.')).toBeVisible();
  });

  test('a late webhook is covered by the server-side check after a few seconds', async ({
    page,
  }) => {
    await addFirstProduct(page);
    await goToMercadoPago(page);
    await page.locator('#approve-late').click(); // approved on Mercado Pago, but no notification

    await expect(paymentTitle(page)).toHaveText(/Procesando/);
    await expect(paymentTitle(page)).toHaveText('¡Pago confirmado!', { timeout: 30_000 });
  });

  test('never trusts the redirect: "status=approved" with a pending payment is not a confirmation', async ({
    page,
  }) => {
    await addFirstProduct(page);
    await goToMercadoPago(page);
    await page.locator('#lie').click(); // payment pending, redirect says approved

    expect(page.url()).toContain('status=approved');
    await expect(paymentTitle(page)).toHaveText('Pago pendiente', { timeout: 30_000 });
    await expect(page.getByText('¡Pago confirmado!')).toHaveCount(0);
  });

  test('a pending payment (cash) waits and does not confirm', async ({ page }) => {
    await addFirstProduct(page);
    await goToMercadoPago(page);
    await page.locator('#pending').click();

    await expect(paymentTitle(page)).toHaveText('Pago pendiente', { timeout: 30_000 });
  });

  test('a rejected payment can be retried on the same order', async ({ page }) => {
    await addFirstProduct(page);
    await goToMercadoPago(page);
    await page.locator('#reject').click();

    await expect(paymentTitle(page)).toHaveText('No se pudo completar el pago', {
      timeout: 30_000,
    });
    await page.getByRole('link', { name: 'Intentar de nuevo' }).click();
    await expect(page).toHaveURL(/\/checkout\/pay$/);
    await page.getByRole('button', { name: 'Pagar con Mercado Pago' }).click();
    await page.locator('#approve').click();

    await expect(paymentTitle(page)).toHaveText('¡Pago confirmado!');
  });
});

test.describe('checkout', () => {
  test('offers pickup and flat-rate delivery, and the price of each', async ({ page }) => {
    await addFirstProduct(page);
    await fillDetails(page);

    await expect(page.getByRole('radio', { name: /Retiro en el local/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Envío a domicilio/ })).toBeVisible();
    await expect(page.getByText('Gratis')).toBeVisible();

    await chooseDelivery(page, 'Envío a domicilio');
    await expect(page.getByText('Envío a domicilio')).toBeVisible();
    await expect(page.getByText('$ 1.500,00', { exact: false }).first()).toBeVisible();
  });

  test('refuses to charge an order that changed after the buyer reviewed it', async ({
    page,
    context,
  }) => {
    await addFirstProduct(page);
    await fillDetails(page);
    await chooseDelivery(page, 'Retiro en el local'); // the review screen, with its total

    // In another tab of the same browser the buyer changes the quantity.
    const other = await context.newPage();
    await other.goto('/cart');
    await other.getByRole('spinbutton').fill('2');
    await other.getByRole('button', { name: 'Actualizar' }).click();
    await expect(other.getByRole('link', { name: /Carrito \(2\)/ })).toBeVisible();

    await page.getByRole('button', { name: 'Pagar con Mercado Pago' }).click();

    await expect(page.getByText(/Tu pedido cambió mientras lo revisabas/)).toBeVisible();
    await expect(page).toHaveURL(/\/checkout\/pay/);
  });

  test('an empty cart cannot be checked out', async ({ page }) => {
    await page.goto('/checkout');

    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByText('Tu carrito está vacío.')).toBeVisible();
  });

  test('a cart line can be changed and removed', async ({ page }) => {
    await addFirstProduct(page);

    await page.getByRole('spinbutton').fill('3');
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await expect(page.getByRole('link', { name: /Carrito \(3\)/ })).toBeVisible();

    await page.getByRole('button', { name: 'Quitar' }).first().click();
    await expect(page.getByText('Tu carrito está vacío.')).toBeVisible();
  });

  test('an invalid coupon is explained', async ({ page }) => {
    await addFirstProduct(page);

    await page.getByPlaceholder('Código de cupón').fill('NOPE');
    await page.getByRole('button', { name: 'Aplicar' }).click();

    await expect(page.getByText('El cupón no es válido.')).toBeVisible();
  });
});

test.describe('optional account', () => {
  test('is not needed to buy and explains that it is shared', async ({ page }) => {
    await page.goto('/account');

    await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
    await expect(page.getByText(/La cuenta es opcional/)).toBeVisible();
    await expect(
      page.getByText(/sirve en todas sus tiendas|también entrás en las otras tiendas/).first(),
    ).toBeVisible();
  });

  test('reports wrong credentials', async ({ page }) => {
    await page.goto('/account');
    await page.getByLabel('Email').fill('nadie@example.test');
    await page.getByLabel('Contraseña').fill('incorrecta-123');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page.getByText('Email o contraseña incorrectos.')).toBeVisible();
  });
});
