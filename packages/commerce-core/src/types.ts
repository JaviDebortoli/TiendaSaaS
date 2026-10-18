import type { ResultOf } from '@graphql-typed-document-node/core';
import type {
  CollectionQuery,
  CollectionsQuery,
  ProductQuery,
  ProductsQuery,
  SearchQuery,
} from './operations/catalog';
import type { CartFragment, ProductSummaryFragment } from './operations/fragments';
import type {
  EligiblePaymentMethodsQuery,
  EligibleShippingMethodsQuery,
} from './operations/checkout';
import type { ActiveCustomerQuery, CustomerOrdersQuery } from './operations/account';

/** All amounts are integers in cents (ARS, taxes included): `129900` is $1.299,00. */
export type Cents = number;

/** The cart and, after checkout, the order: Vendure uses one entity for both. */
export type Cart = ResultOf<typeof CartFragment>;
export type CartLine = Cart['lines'][number];

export type ProductSummary = ResultOf<typeof ProductSummaryFragment>;
export type ProductDetail = NonNullable<ResultOf<typeof ProductQuery>['product']>;
export type ProductList = ResultOf<typeof ProductsQuery>['products'];
export type SearchResult = ResultOf<typeof SearchQuery>['search'];
export type SearchItem = SearchResult['items'][number];
export type CollectionSummary = ResultOf<typeof CollectionsQuery>['collections']['items'][number];
export type CollectionDetail = NonNullable<ResultOf<typeof CollectionQuery>['collection']>;

export type ShippingMethodQuote = ResultOf<
  typeof EligibleShippingMethodsQuery
>['eligibleShippingMethods'][number];
export type PaymentMethodQuote = ResultOf<
  typeof EligiblePaymentMethodsQuery
>['eligiblePaymentMethods'][number];

export type Customer = NonNullable<ResultOf<typeof ActiveCustomerQuery>['activeCustomer']>;
export type OrderSummary = NonNullable<
  ResultOf<typeof CustomerOrdersQuery>['activeCustomer']
>['orders']['items'][number];

export interface Address {
  fullName: string;
  company?: string;
  streetLine1: string;
  streetLine2?: string;
  city: string;
  province?: string;
  postalCode?: string;
  /** ISO 3166-1 alpha-2, e.g. "AR". */
  countryCode: string;
  phoneNumber?: string;
}

export interface CustomerDetails {
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
}

export interface ListOptions {
  skip?: number;
  take?: number;
}
