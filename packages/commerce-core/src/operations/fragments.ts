import { graphql } from '../gql';

export const CartFragment = graphql(`
  fragment Cart on Order {
    id
    code
    state
    active
    currencyCode
    totalQuantity
    subTotalWithTax
    shippingWithTax
    totalWithTax
    couponCodes
    discounts {
      description
      amountWithTax
    }
    customer {
      emailAddress
      firstName
      lastName
    }
    shippingAddress {
      fullName
      company
      streetLine1
      streetLine2
      city
      province
      postalCode
      countryCode
      phoneNumber
    }
    shippingLines {
      priceWithTax
      shippingMethod {
        id
        code
        name
      }
    }
    lines {
      id
      quantity
      unitPriceWithTax
      linePriceWithTax
      discountedLinePriceWithTax
      productVariant {
        id
        name
        sku
        currencyCode
        product {
          slug
        }
      }
      featuredAsset {
        preview
      }
    }
    payments {
      id
      state
      transactionId
      amount
    }
  }
`);

export const ProductSummaryFragment = graphql(`
  fragment ProductSummary on Product {
    id
    name
    slug
    description
    featuredAsset {
      preview
    }
    variants {
      id
      name
      sku
      priceWithTax
      currencyCode
      stockLevel
    }
  }
`);
