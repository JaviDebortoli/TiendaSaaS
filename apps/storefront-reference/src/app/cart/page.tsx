import Link from 'next/link';
import {
  applyCouponAction,
  removeCouponAction,
  removeLineAction,
  setQuantityAction,
} from '@/app/actions/cart';
import { ErrorBanner, Money, Page, SecondaryButton } from '@/components/ui';
import { getCommerce } from '@/lib/commerce';

export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const commerce = await getCommerce();
  const cart = await commerce.cart.getCart();

  if (!cart || cart.lines.length === 0) {
    return (
      <Page title="Carrito">
        <ErrorBanner message={error} />
        <p>
          Tu carrito está vacío.{' '}
          <Link href="/" className="underline">
            Ver productos
          </Link>
        </p>
      </Page>
    );
  }

  return (
    <Page title="Carrito">
      <ErrorBanner message={error} />
      <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
        {cart.lines.map((line) => (
          <li key={line.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div>
              <Link href={`/products/${line.productVariant.product.slug}`} className="font-medium">
                {line.productVariant.name}
              </Link>
              <p className="text-sm text-neutral-600">
                <Money cents={line.unitPriceWithTax} /> c/u
              </p>
            </div>
            <div className="flex items-center gap-3">
              <form action={setQuantityAction} className="flex items-center gap-2">
                <input type="hidden" name="lineId" value={line.id} />
                <label className="text-sm">
                  <span className="sr-only">Cantidad de {line.productVariant.name}</span>
                  <input
                    type="number"
                    name="quantity"
                    min={0}
                    defaultValue={line.quantity}
                    className="w-20 rounded border border-neutral-400 px-2 py-1"
                  />
                </label>
                <SecondaryButton type="submit">Actualizar</SecondaryButton>
              </form>
              <form action={removeLineAction}>
                <input type="hidden" name="lineId" value={line.id} />
                <SecondaryButton type="submit">Quitar</SecondaryButton>
              </form>
              <p className="w-28 text-right font-medium">
                <Money cents={line.discountedLinePriceWithTax} />
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <form action={applyCouponAction} className="flex gap-2">
            <label className="flex-1 text-sm">
              <span className="sr-only">Código de cupón</span>
              <input
                name="code"
                placeholder="Código de cupón"
                className="w-full rounded border border-neutral-400 px-3 py-2"
              />
            </label>
            <SecondaryButton type="submit">Aplicar</SecondaryButton>
          </form>
          {cart.couponCodes.map((code) => (
            <form key={code} action={removeCouponAction} className="mt-2 text-sm">
              <input type="hidden" name="code" value={code} />
              Cupón {code} aplicado.{' '}
              <button type="submit" className="underline">
                Quitar
              </button>
            </form>
          ))}
        </div>

        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal (con descuentos)</dt>
            <dd>
              <Money cents={cart.subTotalWithTax} />
            </dd>
          </div>
          {cart.discounts.map((discount) => (
            <div key={discount.description} className="flex justify-between">
              <dt>{discount.description}</dt>
              <dd>
                <Money cents={discount.amountWithTax} />
              </dd>
            </div>
          ))}
          <div className="flex justify-between text-neutral-600">
            <dt>Envío</dt>
            <dd>Se calcula en el siguiente paso</dd>
          </div>
          <div className="flex justify-between border-t border-neutral-300 pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>
              <Money cents={cart.totalWithTax} />
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-8 text-right">
        <Link
          href="/checkout"
          className="inline-block rounded bg-neutral-900 px-5 py-3 font-medium text-white hover:bg-neutral-700"
        >
          Finalizar compra
        </Link>
      </div>
    </Page>
  );
}
