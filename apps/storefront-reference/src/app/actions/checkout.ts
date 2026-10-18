'use server';

import { redirect } from 'next/navigation';
import { getCommerce } from '@/lib/commerce';
import { getConfig } from '@/lib/config';
import { attempt, field, redirectWithError } from '@/lib/flash';

/** Step 1: who the buyer is and where the order goes. Works for guests. */
export async function saveDetailsAction(form: FormData) {
  const commerce = await getCommerce();
  const email = field(form, 'email');
  const firstName = field(form, 'firstName');
  const lastName = field(form, 'lastName');

  const result = await attempt(async () => {
    // A signed-in customer already has their details on the order.
    if ((await commerce.account.getCustomer()) === null) {
      await commerce.checkout.setCustomer({
        email,
        firstName,
        lastName,
        phoneNumber: field(form, 'phoneNumber') || undefined,
      });
    }
    await commerce.checkout.setShippingAddress({
      fullName: `${firstName} ${lastName}`.trim(),
      streetLine1: field(form, 'streetLine1'),
      streetLine2: field(form, 'streetLine2') || undefined,
      city: field(form, 'city'),
      province: field(form, 'province') || undefined,
      postalCode: field(form, 'postalCode') || undefined,
      countryCode: 'AR',
      phoneNumber: field(form, 'phoneNumber') || undefined,
    });
  });
  if (!result.ok) redirectWithError('/checkout', result.message);
  redirect('/checkout/delivery');
}

/** Step 2: pickup or delivery, among the methods this order qualifies for. */
export async function chooseDeliveryAction(form: FormData) {
  const commerce = await getCommerce();
  const result = await attempt(() =>
    commerce.checkout.selectShippingMethod(field(form, 'shippingMethodId')),
  );
  if (!result.ok) redirectWithError('/checkout/delivery', result.message);
  redirect('/checkout/pay');
}

/**
 * Step 3: asks the server for the Mercado Pago page and sends the buyer there. Nothing is
 * confirmed here: the result page asks the server what happened.
 */
export async function startPaymentAction() {
  const commerce = await getCommerce();
  const { publicUrl } = getConfig();

  const result = await attempt(() =>
    commerce.checkout.startPayment({
      successUrl: `${publicUrl}/checkout/result?outcome=success`,
      failureUrl: `${publicUrl}/checkout/result?outcome=failure`,
      pendingUrl: `${publicUrl}/checkout/result?outcome=pending`,
    }),
  );
  if (!result.ok) redirectWithError('/checkout/pay', result.message);
  redirect(result.value.redirectUrl);
}
