import { graphql } from '../gql';

export const ActiveOrderQuery = graphql(`
  query ActiveOrder {
    activeOrder {
      ...Cart
    }
  }
`);

export const AddItemMutation = graphql(`
  mutation AddItem($variantId: ID!, $quantity: Int!) {
    addItemToOrder(productVariantId: $variantId, quantity: $quantity) {
      __typename
      ...Cart
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`);

export const AdjustLineMutation = graphql(`
  mutation AdjustLine($lineId: ID!, $quantity: Int!) {
    adjustOrderLine(orderLineId: $lineId, quantity: $quantity) {
      __typename
      ...Cart
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`);

export const RemoveLineMutation = graphql(`
  mutation RemoveLine($lineId: ID!) {
    removeOrderLine(orderLineId: $lineId) {
      __typename
      ...Cart
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`);

export const ApplyCouponMutation = graphql(`
  mutation ApplyCoupon($code: String!) {
    applyCouponCode(couponCode: $code) {
      __typename
      ...Cart
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`);

export const RemoveCouponMutation = graphql(`
  mutation RemoveCoupon($code: String!) {
    removeCouponCode(couponCode: $code) {
      ...Cart
    }
  }
`);
