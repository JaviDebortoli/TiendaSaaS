import Link from 'next/link';
import { redirect } from 'next/navigation';
import { chooseDeliveryAction } from '@/app/actions/checkout';
import { ErrorBanner, Money, Page, PrimaryButton } from '@/components/ui';
import { getCommerce } from '@/lib/commerce';

/** Step 2 of 3: only the methods this order qualifies for are offered. */
export default async function DeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const commerce = await getCommerce();
  const cart = await commerce.cart.getCart();
  if (!cart || cart.lines.length === 0) redirect('/cart');
  if (!cart.shippingAddress) redirect('/checkout');
  // Coming back from the payment step (for example after a delivery change).
  if (cart.state === 'ArrangingPayment') await commerce.checkout.backToCart();

  const methods = await commerce.checkout.getShippingMethods();
  const selected = cart.shippingLines[0]?.shippingMethod.id;

  return (
    <Page title="Entrega">
      <p className="mb-4 text-sm text-neutral-600">Paso 2 de 3 · Cómo recibís tu pedido</p>
      <ErrorBanner message={error} />
      {methods.length === 0 ? (
        <p>
          Ninguna forma de entrega está disponible para esa dirección.{' '}
          <Link href="/checkout" className="underline">
            Cambiar la dirección
          </Link>
        </p>
      ) : (
        <form action={chooseDeliveryAction} className="max-w-xl space-y-3">
          <fieldset className="space-y-3">
            <legend className="sr-only">Forma de entrega</legend>
            {methods.map((method, index) => (
              <label
                key={method.id}
                className="flex cursor-pointer items-start gap-3 rounded border border-neutral-300 p-3"
              >
                <input
                  type="radio"
                  name="shippingMethodId"
                  value={method.id}
                  defaultChecked={selected ? selected === method.id : index === 0}
                  required
                  className="mt-1"
                />
                <span className="flex-1">
                  <span className="block font-medium">{method.name}</span>
                  {method.description && (
                    <span className="block text-sm text-neutral-600">{method.description}</span>
                  )}
                </span>
                <span className="font-medium">
                  {method.priceWithTax === 0 ? 'Gratis' : <Money cents={method.priceWithTax} />}
                </span>
              </label>
            ))}
          </fieldset>
          <PrimaryButton type="submit">Continuar al pago</PrimaryButton>
        </form>
      )}
    </Page>
  );
}
