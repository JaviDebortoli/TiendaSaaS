import { formatMoney } from '@tiendasaas/commerce-core';
import { notFound } from 'next/navigation';
import { addToCartAction } from '@/app/actions/cart';
import { ErrorBanner, Money, Page, PrimaryButton } from '@/components/ui';
import { getCommerce } from '@/lib/commerce';

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const commerce = await getCommerce();
  const product = await commerce.catalog.getProduct(slug);
  if (!product) notFound();

  const sellable = product.variants.filter((v) => v.stockLevel !== 'OUT_OF_STOCK');

  return (
    <Page title={product.name}>
      <ErrorBanner message={error} />
      <div className="grid gap-8 md:grid-cols-2">
        {product.featuredAsset ? (
          // A plain img keeps this example free of image host configuration.
          <img
            src={`${product.featuredAsset.preview}?preset=large`}
            alt={product.name}
            className="w-full rounded bg-neutral-100"
          />
        ) : (
          <div className="aspect-square w-full rounded bg-neutral-100" aria-hidden />
        )}
        <div>
          <div
            className="mb-6 text-neutral-700"
            // The description is HTML written by the store owner in the dashboard.
            dangerouslySetInnerHTML={{ __html: product.description }}
          />
          {sellable.length === 0 ? (
            <p className="font-medium">Sin stock por el momento.</p>
          ) : (
            <form action={addToCartAction} className="space-y-4">
              <input type="hidden" name="slug" value={product.slug} />
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Opción</span>
                <select
                  name="variantId"
                  className="w-full rounded border border-neutral-400 px-3 py-2"
                >
                  {sellable.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name} · {formatMoney(variant.priceWithTax, variant.currencyCode)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Cantidad</span>
                <input
                  type="number"
                  name="quantity"
                  min={1}
                  defaultValue={1}
                  className="w-24 rounded border border-neutral-400 px-3 py-2"
                />
              </label>
              <p className="text-lg font-medium">
                <Money cents={Math.min(...sellable.map((v) => v.priceWithTax))} />
              </p>
              <PrimaryButton type="submit">Agregar al carrito</PrimaryButton>
            </form>
          )}
        </div>
      </div>
    </Page>
  );
}
