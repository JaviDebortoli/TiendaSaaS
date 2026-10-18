'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCommerce } from '@/lib/commerce';
import { attempt, field, redirectWithError } from '@/lib/flash';

export async function loginAction(form: FormData) {
  const commerce = await getCommerce();
  const result = await attempt(() =>
    commerce.account.login(field(form, 'email'), String(form.get('password') ?? '')),
  );
  if (!result.ok) redirectWithError('/account', result.message);
  revalidatePath('/', 'layout');
  redirect('/account');
}

export async function logoutAction() {
  const commerce = await getCommerce();
  await attempt(() => commerce.account.logout());
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function registerAction(form: FormData) {
  const commerce = await getCommerce();
  const result = await attempt(() =>
    commerce.account.register({
      email: field(form, 'email'),
      password: String(form.get('password') ?? ''),
      firstName: field(form, 'firstName'),
      lastName: field(form, 'lastName'),
    }),
  );
  if (!result.ok) redirectWithError('/account/register', result.message);
  redirect('/account/register?sent=1');
}

export async function verifyAction(form: FormData) {
  const token = field(form, 'token');
  const password = String(form.get('password') ?? '') || undefined;
  const commerce = await getCommerce();

  const result = await attempt(() => commerce.account.verifyEmail(token, password));
  if (!result.ok)
    redirectWithError(`/account/verify?token=${encodeURIComponent(token)}`, result.message);
  revalidatePath('/', 'layout');
  redirect('/account');
}
