import Link from 'next/link';
import { redirect } from 'next/navigation';
import { startPaymentAction } from '@/app/actions/checkout';
import { ErrorBanner, Money, Page, PrimaryButton } from '@/components/ui';
import { getCommerce } from '@/lib/commerce';

/** Step 3 of 3: review and pay on Mercado Pago. */
export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const commerce = await getCommerce();
  const cart = await commerce.cart.getCart();
  if (!cart || cart.lines.length === 0) redirect('/cart');
  if (!cart.shippingAddress) redirect('/checkout');
  const shipping = cart.shippingLines[0];
  if (!shipping) redirect('/checkout/delivery');

  const methods = await commerce.checkout.getPaymentMethods();
  const canPay = methods.some((method) => method.code === 'mercado-pago');

  return (
    <Page title="Pagar">
      <p className="mb-4 text-sm text-neutral-600">Paso 3 de 3 · Revisá y pagá</p>
      <ErrorBanner message={error} />
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-2 font-medium">Tu pedido</h2>
          <ul className="space-y-1 text-sm">
            {cart.lines.map((line) => (
              <li key={line.id} className="flex justify-between gap-4">
                <span>
                  {line.quantity} × {line.productVariant.name}
                </span>
                <Money cents={line.discountedLinePriceWithTax} />
              </li>
            ))}
            <li className="flex justify-between gap-4">
              <span>{shipping.shippingMethod.name}</span>
              <span>
                {shipping.priceWithTax === 0 ? 'Gratis' : <Money cents={shipping.priceWithTax} />}
              </span>
            </li>
          </ul>
          <p className="mt-3 flex justify-between border-t border-neutral-300 pt-3 text-lg font-semibold">
            <span>Total</span>
            <Money cents={cart.totalWithTax} />
          </p>
        </div>
        <div>
          <h2 className="mb-2 font-medium">Entrega</h2>
          <p className="text-sm">
            {cart.shippingAddress.fullName}
            <br />
            {cart.shippingAddress.streetLine1}
            {cart.shippingAddress.streetLine2 ? `, ${cart.shippingAddress.streetLine2}` : ''}
            <br />
            {cart.shippingAddress.city}
            {cart.shippingAddress.province ? `, ${cart.shippingAddress.province}` : ''}
          </p>
          <p className="mt-2 text-sm">
            <Link href="/checkout/delivery" className="underline">
              Cambiar la entrega
            </Link>
          </p>
          <form action={startPaymentAction} className="mt-8">
            <input type="hidden" name="expectedTotal" value={cart.totalWithTax} />
            <PrimaryButton type="submit" disabled={!canPay} className="w-full py-3">
              Pagar con Mercado Pago
            </PrimaryButton>
            {!canPay && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                Esta tienda no puede cobrar en este momento.
              </p>
            )}
            <p className="mt-2 text-xs text-neutral-600">
              Vas a pagar en el sitio de Mercado Pago y volvés acá cuando termines.
            </p>
          </form>
        </div>
      </div>
    </Page>
  );
}
