import { graphql } from '../gql';

export const ProductsQuery = graphql(`
  query Products($options: ProductListOptions) {
    products(options: $options) {
      totalItems
      items {
        ...ProductSummary
      }
    }
  }
`);

export const ProductQuery = graphql(`
  query Product($slug: String) {
    product(slug: $slug) {
      ...ProductSummary
      assets {
        preview
        source
      }
      collections {
        id
        slug
        name
      }
    }
  }
`);

export const SearchQuery = graphql(`
  query Search($input: SearchInput!) {
    search(input: $input) {
      totalItems
      items {
        productId
        productName
        slug
        description
        productAsset {
          preview
        }
        priceWithTax {
          ... on SinglePrice {
            value
          }
          ... on PriceRange {
            min
            max
          }
        }
        currencyCode
      }
      facetValues {
        count
        facetValue {
          id
          name
          facet {
            id
            name
          }
        }
      }
    }
  }
`);

export const CollectionsQuery = graphql(`
  query Collections($options: CollectionListOptions) {
    collections(options: $options) {
      totalItems
      items {
        id
        slug
        name
        parentId
        featuredAsset {
          preview
        }
      }
    }
  }
`);

export const CollectionQuery = graphql(`
  query Collection($slug: String) {
    collection(slug: $slug) {
      id
      slug
      name
      description
      breadcrumbs {
        id
        slug
        name
      }
    }
  }
`);
