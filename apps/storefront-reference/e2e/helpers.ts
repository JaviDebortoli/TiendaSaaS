import { expect, type Page } from '@playwright/test';

/** Adds the first product of the store to the cart. */
export async function addFirstProduct(page: Page): Promise<string> {
  await page.goto('/');
  const first = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading') })
    .first();
  const name = (await first.getByRole('heading').textContent()) ?? '';
  await first.getByRole('link').click();
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(page).toHaveURL(/\/cart$/);
  return name;
}

export interface BuyerDetails {
  email?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
}

/** Fills the first checkout step (contact and address) as a guest. */
export async function fillDetails(page: Page, buyer: BuyerDetails = {}): Promise<void> {
  await page.getByRole('link', { name: 'Finalizar compra' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await page.getByLabel('Email').fill(buyer.email ?? `comprador-${Date.now()}@example.test`);
  await page.getByLabel('Nombre').fill(buyer.firstName ?? 'Ana');
  await page.getByLabel('Apellido').fill(buyer.lastName ?? 'Pérez');
  await page.getByLabel('Calle y número').fill('Calle Falsa 123');
  await page.getByLabel('Ciudad').fill(buyer.city ?? 'Rosario');
  await page.getByLabel('Provincia').fill('Santa Fe');
  await page.getByLabel('Código postal').fill('2000');
  await page.getByRole('button', { name: 'Continuar a la entrega' }).click();
  await expect(page).toHaveURL(/\/checkout\/delivery$/);
}

/** Chooses a delivery method by its visible name and moves to the payment step. */
export async function chooseDelivery(page: Page, name: string): Promise<void> {
  await page.getByRole('radio', { name: new RegExp(name) }).check();
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  await expect(page).toHaveURL(/\/checkout\/pay$/);
}

/** From a filled cart to the simulated Mercado Pago page. */
export async function goToMercadoPago(page: Page, delivery = 'Retiro en el local'): Promise<void> {
  await fillDetails(page);
  await chooseDelivery(page, delivery);
  await page.getByRole('button', { name: 'Pagar con Mercado Pago' }).click();
  await expect(page).toHaveURL(/localhost:3399\/checkout\/pref-\d+/);
}

export const paymentTitle = (page: Page) => page.getByTestId('payment-title');
