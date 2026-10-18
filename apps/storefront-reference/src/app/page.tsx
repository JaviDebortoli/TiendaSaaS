import Link from 'next/link';
import { Money, Page } from '@/components/ui';
import { getCommerce } from '@/lib/commerce';

const PAGE_SIZE = 12;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const commerce = await getCommerce();
  const { items, totalItems } = await commerce.catalog.listProducts({
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    sort: 'name',
    direction: 'ASC',
  });
  const pages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  return (
    <Page title="Productos">
      {items.length === 0 ? (
        <p>Todavía no hay productos.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {items.map((product) => {
            const price = Math.min(...product.variants.map((v) => v.priceWithTax));
            return (
              <li key={product.id} className="rounded border border-neutral-200 p-3">
                <Link href={`/products/${product.slug}`} className="block">
                  {product.featuredAsset ? (
                    // A plain img keeps this example free of image host configuration.
                    <img
                      src={`${product.featuredAsset.preview}?preset=medium`}
                      alt=""
                      className="mb-2 aspect-square w-full rounded bg-neutral-100 object-cover"
                    />
                  ) : (
                    <div className="mb-2 aspect-square w-full rounded bg-neutral-100" aria-hidden />
                  )}
                  <h2 className="font-medium">{product.name}</h2>
                  <p className="text-sm text-neutral-700">
                    <Money cents={price} />
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Paginación" className="mt-8 flex justify-center gap-4 text-sm">
          {page > 1 && <Link href={`/?page=${page - 1}`}>← Anterior</Link>}
          <span>
            Página {page} de {pages}
          </span>
          {page < pages && <Link href={`/?page=${page + 1}`}>Siguiente →</Link>}
        </nav>
      )}
    </Page>
  );
}
