import { graphql } from '../gql';

export const RegisterMutation = graphql(`
  mutation Register($input: RegisterCustomerInput!) {
    registerCustomerAccount(input: $input) {
      __typename
      ... on Success {
        success
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`);

export const LoginMutation = graphql(`
  mutation Login($email: String!, $password: String!, $rememberMe: Boolean) {
    login(username: $email, password: $password, rememberMe: $rememberMe) {
      __typename
      ... on CurrentUser {
        id
        identifier
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`);

export const LogoutMutation = graphql(`
  mutation Logout {
    logout {
      success
    }
  }
`);

export const ActiveCustomerQuery = graphql(`
  query ActiveCustomer {
    activeCustomer {
      id
      emailAddress
      firstName
      lastName
      phoneNumber
    }
  }
`);

export const CustomerOrdersQuery = graphql(`
  query CustomerOrders($options: OrderListOptions) {
    activeCustomer {
      id
      orders(options: $options) {
        totalItems
        items {
          id
          code
          state
          orderPlacedAt
          currencyCode
          totalQuantity
          totalWithTax
        }
      }
    }
  }
`);

export const VerifyEmailMutation = graphql(`
  mutation VerifyEmail($token: String!, $password: String) {
    verifyCustomerAccount(token: $token, password: $password) {
      __typename
      ... on CurrentUser {
        id
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`);

export const RequestPasswordResetMutation = graphql(`
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(emailAddress: $email) {
      __typename
      ... on Success {
        success
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`);

export const ResetPasswordMutation = graphql(`
  mutation ResetPassword($token: String!, $password: String!) {
    resetPassword(token: $token, password: $password) {
      __typename
      ... on CurrentUser {
        id
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`);
