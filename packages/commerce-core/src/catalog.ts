import type { Transport } from './client';
import {
  CollectionQuery,
  CollectionsQuery,
  ProductQuery,
  ProductsQuery,
  SearchQuery,
} from './operations/catalog';
import type {
  CollectionDetail,
  CollectionSummary,
  ListOptions,
  ProductDetail,
  ProductList,
  SearchResult,
} from './types';

const DEFAULT_TAKE = 24;
// The server rejects very large pages (HardenPlugin complexity limit), so ask for sane sizes.
const MAX_TAKE = 100;

const page = ({ skip = 0, take = DEFAULT_TAKE }: ListOptions) => ({
  skip: Math.max(0, skip),
  take: Math.min(MAX_TAKE, Math.max(1, take)),
});

export interface SearchOptions extends ListOptions {
  /** Free text. */
  term?: string;
  collectionSlug?: string;
  facetValueIds?: string[];
  sort?: 'name' | 'price';
  direction?: 'ASC' | 'DESC';
}

export function createCatalog(transport: Transport) {
  return {
    /** A page of products, newest first unless sorted. */
    async listProducts(
      options: ListOptions & { sort?: 'name' | 'createdAt'; direction?: 'ASC' | 'DESC' } = {},
    ): Promise<ProductList> {
      const { products } = await transport.request(ProductsQuery, {
        options: {
          ...page(options),
          sort: { [options.sort ?? 'createdAt']: options.direction ?? 'DESC' },
        },
      });
      return products;
    },

    /** One product by its slug, or `null` when the store does not sell it. */
    async getProduct(slug: string): Promise<ProductDetail | null> {
      const { product } = await transport.request(ProductQuery, { slug });
      return product ?? null;
    },

    /**
     * Search with text, collection and facets. Uses the search index, which the worker keeps up
     * to date: products show up a moment after they are saved.
     */
    async searchProducts(options: SearchOptions = {}): Promise<SearchResult> {
      const { search } = await transport.request(SearchQuery, {
        input: {
          ...page(options),
          groupByProduct: true,
          term: options.term?.trim() || undefined,
          collectionSlug: options.collectionSlug,
          facetValueIds: options.facetValueIds,
          facetValueOperator: 'AND',
          sort: options.sort ? { [options.sort]: options.direction ?? 'ASC' } : undefined,
        },
      });
      return search;
    },

    /** Top-level collections (categories). */
    async listCollections(options: ListOptions = {}): Promise<CollectionSummary[]> {
      const { collections } = await transport.request(CollectionsQuery, {
        options: { ...page({ take: MAX_TAKE, ...options }), topLevelOnly: true },
      });
      return collections.items;
    },

    async getCollection(slug: string): Promise<CollectionDetail | null> {
      const { collection } = await transport.request(CollectionQuery, { slug });
      return collection ?? null;
    },
  };
}

export type Catalog = ReturnType<typeof createCatalog>;
