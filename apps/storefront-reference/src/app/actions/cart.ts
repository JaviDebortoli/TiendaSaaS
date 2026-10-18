'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCommerce } from '@/lib/commerce';
import { attempt, field, redirectWithError } from '@/lib/flash';

export async function addToCartAction(form: FormData) {
  const slug = field(form, 'slug');
  const variantId = field(form, 'variantId');
  const quantity = Math.max(1, Number(field(form, 'quantity')) || 1);
  const commerce = await getCommerce();

  const result = await attempt(() => commerce.cart.addToCart(variantId, quantity));
  if (!result.ok) redirectWithError(`/products/${slug}`, result.message);
  revalidatePath('/', 'layout');
  redirect('/cart');
}

export async function setQuantityAction(form: FormData) {
  const lineId = field(form, 'lineId');
  const quantity = Number(field(form, 'quantity'));
  const commerce = await getCommerce();

  const result = await attempt(() => commerce.cart.setLineQuantity(lineId, quantity));
  if (!result.ok) redirectWithError('/cart', result.message);
  revalidatePath('/', 'layout');
  redirect('/cart');
}

export async function removeLineAction(form: FormData) {
  const commerce = await getCommerce();
  const result = await attempt(() => commerce.cart.removeFromCart(field(form, 'lineId')));
  if (!result.ok) redirectWithError('/cart', result.message);
  revalidatePath('/', 'layout');
  redirect('/cart');
}

export async function applyCouponAction(form: FormData) {
  const code = field(form, 'code');
  if (!code) redirect('/cart');
  const commerce = await getCommerce();

  const result = await attempt(() => commerce.cart.applyCoupon(code));
  if (!result.ok) redirectWithError('/cart', result.message);
  redirect('/cart');
}

export async function removeCouponAction(form: FormData) {
  const commerce = await getCommerce();
  const result = await attempt(() => commerce.cart.removeCoupon(field(form, 'code')));
  if (!result.ok) redirectWithError('/cart', result.message);
  redirect('/cart');
}
