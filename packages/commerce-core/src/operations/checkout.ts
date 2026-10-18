import { graphql } from '../gql';

export const SetCustomerMutation = graphql(`
  mutation SetCustomer($input: CreateCustomerInput!) {
    setCustomerForOrder(input: $input) {
      __typename
      ...Cart
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`);

export const SetShippingAddressMutation = graphql(`
  mutation SetShippingAddress($input: CreateAddressInput!) {
    setOrderShippingAddress(input: $input) {
      __typename
      ...Cart
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`);

export const SetBillingAddressMutation = graphql(`
  mutation SetBillingAddress($input: CreateAddressInput!) {
    setOrderBillingAddress(input: $input) {
      __typename
      ...Cart
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`);

export const EligibleShippingMethodsQuery = graphql(`
  query EligibleShippingMethods {
    eligibleShippingMethods {
      id
      code
      name
      description
      price
      priceWithTax
    }
  }
`);

export const SetShippingMethodMutation = graphql(`
  mutation SetShippingMethod($ids: [ID!]!) {
    setOrderShippingMethod(shippingMethodId: $ids) {
      __typename
      ...Cart
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`);

export const TransitionOrderMutation = graphql(`
  mutation TransitionOrder($state: String!) {
    transitionOrderToState(state: $state) {
      __typename
      ...Cart
      ... on OrderStateTransitionError {
        errorCode
        message
        transitionError
        fromState
        toState
      }
    }
  }
`);

export const CreateMercadoPagoCheckoutMutation = graphql(`
  mutation CreateMercadoPagoCheckout($input: MercadoPagoCheckoutInput!) {
    createMercadoPagoCheckout(input: $input) {
      __typename
      ... on MercadoPagoCheckout {
        preferenceId
        initPoint
        sandboxInitPoint
        expiresAt
      }
      ... on MercadoPagoError {
        errorCode
        message
        reason
      }
    }
  }
`);

export const SyncMercadoPagoPaymentMutation = graphql(`
  mutation SyncMercadoPagoPayment($orderCode: String!, $paymentId: String!) {
    syncMercadoPagoPayment(orderCode: $orderCode, paymentId: $paymentId) {
      __typename
      ... on MercadoPagoPaymentSync {
        outcome
        orderCode
        orderState
      }
      ... on MercadoPagoError {
        errorCode
        message
        reason
      }
    }
  }
`);

export const OrderByCodeQuery = graphql(`
  query OrderByCode($code: String!) {
    orderByCode(code: $code) {
      ...Cart
    }
  }
`);

export const EligiblePaymentMethodsQuery = graphql(`
  query EligiblePaymentMethods {
    eligiblePaymentMethods {
      code
      name
      isEligible
    }
  }
`);
