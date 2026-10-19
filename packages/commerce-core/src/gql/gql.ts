/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
  '\n  mutation Register($input: RegisterCustomerInput!) {\n    registerCustomerAccount(input: $input) {\n      __typename\n      ... on Success {\n        success\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.RegisterDocument;
  '\n  mutation Login($email: String!, $password: String!, $rememberMe: Boolean) {\n    login(username: $email, password: $password, rememberMe: $rememberMe) {\n      __typename\n      ... on CurrentUser {\n        id\n        identifier\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.LoginDocument;
  '\n  mutation Logout {\n    logout {\n      success\n    }\n  }\n': typeof types.LogoutDocument;
  '\n  query ActiveCustomer {\n    activeCustomer {\n      id\n      emailAddress\n      firstName\n      lastName\n      phoneNumber\n    }\n  }\n': typeof types.ActiveCustomerDocument;
  '\n  query CustomerOrders($options: OrderListOptions) {\n    activeCustomer {\n      id\n      orders(options: $options) {\n        totalItems\n        items {\n          id\n          code\n          state\n          orderPlacedAt\n          currencyCode\n          totalQuantity\n          totalWithTax\n        }\n      }\n    }\n  }\n': typeof types.CustomerOrdersDocument;
  '\n  mutation VerifyEmail($token: String!, $password: String) {\n    verifyCustomerAccount(token: $token, password: $password) {\n      __typename\n      ... on CurrentUser {\n        id\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.VerifyEmailDocument;
  '\n  mutation RequestPasswordReset($email: String!) {\n    requestPasswordReset(emailAddress: $email) {\n      __typename\n      ... on Success {\n        success\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.RequestPasswordResetDocument;
  '\n  mutation ResetPassword($token: String!, $password: String!) {\n    resetPassword(token: $token, password: $password) {\n      __typename\n      ... on CurrentUser {\n        id\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.ResetPasswordDocument;
  '\n  query ActiveOrder {\n    activeOrder {\n      ...Cart\n    }\n  }\n': typeof types.ActiveOrderDocument;
  '\n  mutation AddItem($variantId: ID!, $quantity: Int!) {\n    addItemToOrder(productVariantId: $variantId, quantity: $quantity) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.AddItemDocument;
  '\n  mutation AdjustLine($lineId: ID!, $quantity: Int!) {\n    adjustOrderLine(orderLineId: $lineId, quantity: $quantity) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.AdjustLineDocument;
  '\n  mutation RemoveLine($lineId: ID!) {\n    removeOrderLine(orderLineId: $lineId) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.RemoveLineDocument;
  '\n  mutation ApplyCoupon($code: String!) {\n    applyCouponCode(couponCode: $code) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.ApplyCouponDocument;
  '\n  mutation RemoveCoupon($code: String!) {\n    removeCouponCode(couponCode: $code) {\n      ...Cart\n    }\n  }\n': typeof types.RemoveCouponDocument;
  '\n  query Products($options: ProductListOptions) {\n    products(options: $options) {\n      totalItems\n      items {\n        ...ProductSummary\n      }\n    }\n  }\n': typeof types.ProductsDocument;
  '\n  query Product($slug: String) {\n    product(slug: $slug) {\n      ...ProductSummary\n      assets {\n        preview\n        source\n      }\n      collections {\n        id\n        slug\n        name\n      }\n    }\n  }\n': typeof types.ProductDocument;
  '\n  query Search($input: SearchInput!) {\n    search(input: $input) {\n      totalItems\n      items {\n        productId\n        productName\n        slug\n        description\n        productAsset {\n          preview\n        }\n        priceWithTax {\n          ... on SinglePrice {\n            value\n          }\n          ... on PriceRange {\n            min\n            max\n          }\n        }\n        currencyCode\n      }\n      facetValues {\n        count\n        facetValue {\n          id\n          name\n          facet {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n': typeof types.SearchDocument;
  '\n  query Collections($options: CollectionListOptions) {\n    collections(options: $options) {\n      totalItems\n      items {\n        id\n        slug\n        name\n        parentId\n        featuredAsset {\n          preview\n        }\n      }\n    }\n  }\n': typeof types.CollectionsDocument;
  '\n  query Collection($slug: String) {\n    collection(slug: $slug) {\n      id\n      slug\n      name\n      description\n      breadcrumbs {\n        id\n        slug\n        name\n      }\n    }\n  }\n': typeof types.CollectionDocument;
  '\n  mutation SetCustomer($input: CreateCustomerInput!) {\n    setCustomerForOrder(input: $input) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.SetCustomerDocument;
  '\n  mutation SetShippingAddress($input: CreateAddressInput!) {\n    setOrderShippingAddress(input: $input) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.SetShippingAddressDocument;
  '\n  mutation SetBillingAddress($input: CreateAddressInput!) {\n    setOrderBillingAddress(input: $input) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.SetBillingAddressDocument;
  '\n  query EligibleShippingMethods {\n    eligibleShippingMethods {\n      id\n      code\n      name\n      description\n      price\n      priceWithTax\n    }\n  }\n': typeof types.EligibleShippingMethodsDocument;
  '\n  mutation SetShippingMethod($ids: [ID!]!) {\n    setOrderShippingMethod(shippingMethodId: $ids) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.SetShippingMethodDocument;
  '\n  mutation TransitionOrder($state: String!) {\n    transitionOrderToState(state: $state) {\n      __typename\n      ...Cart\n      ... on OrderStateTransitionError {\n        errorCode\n        message\n        transitionError\n        fromState\n        toState\n      }\n    }\n  }\n': typeof types.TransitionOrderDocument;
  '\n  mutation CreateMercadoPagoCheckout($input: MercadoPagoCheckoutInput!) {\n    createMercadoPagoCheckout(input: $input) {\n      __typename\n      ... on MercadoPagoCheckout {\n        preferenceId\n        initPoint\n        sandboxInitPoint\n        expiresAt\n      }\n      ... on MercadoPagoError {\n        errorCode\n        message\n        reason\n      }\n    }\n  }\n': typeof types.CreateMercadoPagoCheckoutDocument;
  '\n  mutation SyncMercadoPagoPayment($externalReference: String!, $paymentId: String!) {\n    syncMercadoPagoPayment(externalReference: $externalReference, paymentId: $paymentId) {\n      __typename\n      ... on MercadoPagoPaymentSync {\n        outcome\n        orderCode\n        orderState\n      }\n      ... on MercadoPagoError {\n        errorCode\n        message\n        reason\n      }\n    }\n  }\n': typeof types.SyncMercadoPagoPaymentDocument;
  '\n  query OrderByCode($code: String!) {\n    orderByCode(code: $code) {\n      ...Cart\n    }\n  }\n': typeof types.OrderByCodeDocument;
  '\n  query EligiblePaymentMethods {\n    eligiblePaymentMethods {\n      code\n      name\n      isEligible\n    }\n  }\n': typeof types.EligiblePaymentMethodsDocument;
  '\n  fragment Cart on Order {\n    id\n    code\n    state\n    active\n    currencyCode\n    totalQuantity\n    subTotalWithTax\n    shippingWithTax\n    totalWithTax\n    couponCodes\n    discounts {\n      description\n      amountWithTax\n    }\n    customer {\n      emailAddress\n      firstName\n      lastName\n    }\n    shippingAddress {\n      fullName\n      company\n      streetLine1\n      streetLine2\n      city\n      province\n      postalCode\n      countryCode\n      phoneNumber\n    }\n    shippingLines {\n      priceWithTax\n      shippingMethod {\n        id\n        code\n        name\n      }\n    }\n    lines {\n      id\n      quantity\n      unitPriceWithTax\n      linePriceWithTax\n      discountedLinePriceWithTax\n      productVariant {\n        id\n        name\n        sku\n        currencyCode\n        product {\n          slug\n        }\n      }\n      featuredAsset {\n        preview\n      }\n    }\n    payments {\n      id\n      state\n      transactionId\n      amount\n    }\n  }\n': typeof types.CartFragmentDoc;
  '\n  fragment ProductSummary on Product {\n    id\n    name\n    slug\n    description\n    featuredAsset {\n      preview\n    }\n    variants {\n      id\n      name\n      sku\n      priceWithTax\n      currencyCode\n      stockLevel\n    }\n  }\n': typeof types.ProductSummaryFragmentDoc;
};
const documents: Documents = {
  '\n  mutation Register($input: RegisterCustomerInput!) {\n    registerCustomerAccount(input: $input) {\n      __typename\n      ... on Success {\n        success\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.RegisterDocument,
  '\n  mutation Login($email: String!, $password: String!, $rememberMe: Boolean) {\n    login(username: $email, password: $password, rememberMe: $rememberMe) {\n      __typename\n      ... on CurrentUser {\n        id\n        identifier\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.LoginDocument,
  '\n  mutation Logout {\n    logout {\n      success\n    }\n  }\n': types.LogoutDocument,
  '\n  query ActiveCustomer {\n    activeCustomer {\n      id\n      emailAddress\n      firstName\n      lastName\n      phoneNumber\n    }\n  }\n':
    types.ActiveCustomerDocument,
  '\n  query CustomerOrders($options: OrderListOptions) {\n    activeCustomer {\n      id\n      orders(options: $options) {\n        totalItems\n        items {\n          id\n          code\n          state\n          orderPlacedAt\n          currencyCode\n          totalQuantity\n          totalWithTax\n        }\n      }\n    }\n  }\n':
    types.CustomerOrdersDocument,
  '\n  mutation VerifyEmail($token: String!, $password: String) {\n    verifyCustomerAccount(token: $token, password: $password) {\n      __typename\n      ... on CurrentUser {\n        id\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.VerifyEmailDocument,
  '\n  mutation RequestPasswordReset($email: String!) {\n    requestPasswordReset(emailAddress: $email) {\n      __typename\n      ... on Success {\n        success\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.RequestPasswordResetDocument,
  '\n  mutation ResetPassword($token: String!, $password: String!) {\n    resetPassword(token: $token, password: $password) {\n      __typename\n      ... on CurrentUser {\n        id\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.ResetPasswordDocument,
  '\n  query ActiveOrder {\n    activeOrder {\n      ...Cart\n    }\n  }\n':
    types.ActiveOrderDocument,
  '\n  mutation AddItem($variantId: ID!, $quantity: Int!) {\n    addItemToOrder(productVariantId: $variantId, quantity: $quantity) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.AddItemDocument,
  '\n  mutation AdjustLine($lineId: ID!, $quantity: Int!) {\n    adjustOrderLine(orderLineId: $lineId, quantity: $quantity) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.AdjustLineDocument,
  '\n  mutation RemoveLine($lineId: ID!) {\n    removeOrderLine(orderLineId: $lineId) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.RemoveLineDocument,
  '\n  mutation ApplyCoupon($code: String!) {\n    applyCouponCode(couponCode: $code) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.ApplyCouponDocument,
  '\n  mutation RemoveCoupon($code: String!) {\n    removeCouponCode(couponCode: $code) {\n      ...Cart\n    }\n  }\n':
    types.RemoveCouponDocument,
  '\n  query Products($options: ProductListOptions) {\n    products(options: $options) {\n      totalItems\n      items {\n        ...ProductSummary\n      }\n    }\n  }\n':
    types.ProductsDocument,
  '\n  query Product($slug: String) {\n    product(slug: $slug) {\n      ...ProductSummary\n      assets {\n        preview\n        source\n      }\n      collections {\n        id\n        slug\n        name\n      }\n    }\n  }\n':
    types.ProductDocument,
  '\n  query Search($input: SearchInput!) {\n    search(input: $input) {\n      totalItems\n      items {\n        productId\n        productName\n        slug\n        description\n        productAsset {\n          preview\n        }\n        priceWithTax {\n          ... on SinglePrice {\n            value\n          }\n          ... on PriceRange {\n            min\n            max\n          }\n        }\n        currencyCode\n      }\n      facetValues {\n        count\n        facetValue {\n          id\n          name\n          facet {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n':
    types.SearchDocument,
  '\n  query Collections($options: CollectionListOptions) {\n    collections(options: $options) {\n      totalItems\n      items {\n        id\n        slug\n        name\n        parentId\n        featuredAsset {\n          preview\n        }\n      }\n    }\n  }\n':
    types.CollectionsDocument,
  '\n  query Collection($slug: String) {\n    collection(slug: $slug) {\n      id\n      slug\n      name\n      description\n      breadcrumbs {\n        id\n        slug\n        name\n      }\n    }\n  }\n':
    types.CollectionDocument,
  '\n  mutation SetCustomer($input: CreateCustomerInput!) {\n    setCustomerForOrder(input: $input) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.SetCustomerDocument,
  '\n  mutation SetShippingAddress($input: CreateAddressInput!) {\n    setOrderShippingAddress(input: $input) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.SetShippingAddressDocument,
  '\n  mutation SetBillingAddress($input: CreateAddressInput!) {\n    setOrderBillingAddress(input: $input) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.SetBillingAddressDocument,
  '\n  query EligibleShippingMethods {\n    eligibleShippingMethods {\n      id\n      code\n      name\n      description\n      price\n      priceWithTax\n    }\n  }\n':
    types.EligibleShippingMethodsDocument,
  '\n  mutation SetShippingMethod($ids: [ID!]!) {\n    setOrderShippingMethod(shippingMethodId: $ids) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.SetShippingMethodDocument,
  '\n  mutation TransitionOrder($state: String!) {\n    transitionOrderToState(state: $state) {\n      __typename\n      ...Cart\n      ... on OrderStateTransitionError {\n        errorCode\n        message\n        transitionError\n        fromState\n        toState\n      }\n    }\n  }\n':
    types.TransitionOrderDocument,
  '\n  mutation CreateMercadoPagoCheckout($input: MercadoPagoCheckoutInput!) {\n    createMercadoPagoCheckout(input: $input) {\n      __typename\n      ... on MercadoPagoCheckout {\n        preferenceId\n        initPoint\n        sandboxInitPoint\n        expiresAt\n      }\n      ... on MercadoPagoError {\n        errorCode\n        message\n        reason\n      }\n    }\n  }\n':
    types.CreateMercadoPagoCheckoutDocument,
  '\n  mutation SyncMercadoPagoPayment($externalReference: String!, $paymentId: String!) {\n    syncMercadoPagoPayment(externalReference: $externalReference, paymentId: $paymentId) {\n      __typename\n      ... on MercadoPagoPaymentSync {\n        outcome\n        orderCode\n        orderState\n      }\n      ... on MercadoPagoError {\n        errorCode\n        message\n        reason\n      }\n    }\n  }\n':
    types.SyncMercadoPagoPaymentDocument,
  '\n  query OrderByCode($code: String!) {\n    orderByCode(code: $code) {\n      ...Cart\n    }\n  }\n':
    types.OrderByCodeDocument,
  '\n  query EligiblePaymentMethods {\n    eligiblePaymentMethods {\n      code\n      name\n      isEligible\n    }\n  }\n':
    types.EligiblePaymentMethodsDocument,
  '\n  fragment Cart on Order {\n    id\n    code\n    state\n    active\n    currencyCode\n    totalQuantity\n    subTotalWithTax\n    shippingWithTax\n    totalWithTax\n    couponCodes\n    discounts {\n      description\n      amountWithTax\n    }\n    customer {\n      emailAddress\n      firstName\n      lastName\n    }\n    shippingAddress {\n      fullName\n      company\n      streetLine1\n      streetLine2\n      city\n      province\n      postalCode\n      countryCode\n      phoneNumber\n    }\n    shippingLines {\n      priceWithTax\n      shippingMethod {\n        id\n        code\n        name\n      }\n    }\n    lines {\n      id\n      quantity\n      unitPriceWithTax\n      linePriceWithTax\n      discountedLinePriceWithTax\n      productVariant {\n        id\n        name\n        sku\n        currencyCode\n        product {\n          slug\n        }\n      }\n      featuredAsset {\n        preview\n      }\n    }\n    payments {\n      id\n      state\n      transactionId\n      amount\n    }\n  }\n':
    types.CartFragmentDoc,
  '\n  fragment ProductSummary on Product {\n    id\n    name\n    slug\n    description\n    featuredAsset {\n      preview\n    }\n    variants {\n      id\n      name\n      sku\n      priceWithTax\n      currencyCode\n      stockLevel\n    }\n  }\n':
    types.ProductSummaryFragmentDoc,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation Register($input: RegisterCustomerInput!) {\n    registerCustomerAccount(input: $input) {\n      __typename\n      ... on Success {\n        success\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation Register($input: RegisterCustomerInput!) {\n    registerCustomerAccount(input: $input) {\n      __typename\n      ... on Success {\n        success\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation Login($email: String!, $password: String!, $rememberMe: Boolean) {\n    login(username: $email, password: $password, rememberMe: $rememberMe) {\n      __typename\n      ... on CurrentUser {\n        id\n        identifier\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation Login($email: String!, $password: String!, $rememberMe: Boolean) {\n    login(username: $email, password: $password, rememberMe: $rememberMe) {\n      __typename\n      ... on CurrentUser {\n        id\n        identifier\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation Logout {\n    logout {\n      success\n    }\n  }\n',
): (typeof documents)['\n  mutation Logout {\n    logout {\n      success\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query ActiveCustomer {\n    activeCustomer {\n      id\n      emailAddress\n      firstName\n      lastName\n      phoneNumber\n    }\n  }\n',
): (typeof documents)['\n  query ActiveCustomer {\n    activeCustomer {\n      id\n      emailAddress\n      firstName\n      lastName\n      phoneNumber\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query CustomerOrders($options: OrderListOptions) {\n    activeCustomer {\n      id\n      orders(options: $options) {\n        totalItems\n        items {\n          id\n          code\n          state\n          orderPlacedAt\n          currencyCode\n          totalQuantity\n          totalWithTax\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query CustomerOrders($options: OrderListOptions) {\n    activeCustomer {\n      id\n      orders(options: $options) {\n        totalItems\n        items {\n          id\n          code\n          state\n          orderPlacedAt\n          currencyCode\n          totalQuantity\n          totalWithTax\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation VerifyEmail($token: String!, $password: String) {\n    verifyCustomerAccount(token: $token, password: $password) {\n      __typename\n      ... on CurrentUser {\n        id\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation VerifyEmail($token: String!, $password: String) {\n    verifyCustomerAccount(token: $token, password: $password) {\n      __typename\n      ... on CurrentUser {\n        id\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RequestPasswordReset($email: String!) {\n    requestPasswordReset(emailAddress: $email) {\n      __typename\n      ... on Success {\n        success\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation RequestPasswordReset($email: String!) {\n    requestPasswordReset(emailAddress: $email) {\n      __typename\n      ... on Success {\n        success\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ResetPassword($token: String!, $password: String!) {\n    resetPassword(token: $token, password: $password) {\n      __typename\n      ... on CurrentUser {\n        id\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation ResetPassword($token: String!, $password: String!) {\n    resetPassword(token: $token, password: $password) {\n      __typename\n      ... on CurrentUser {\n        id\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query ActiveOrder {\n    activeOrder {\n      ...Cart\n    }\n  }\n',
): (typeof documents)['\n  query ActiveOrder {\n    activeOrder {\n      ...Cart\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation AddItem($variantId: ID!, $quantity: Int!) {\n    addItemToOrder(productVariantId: $variantId, quantity: $quantity) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation AddItem($variantId: ID!, $quantity: Int!) {\n    addItemToOrder(productVariantId: $variantId, quantity: $quantity) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation AdjustLine($lineId: ID!, $quantity: Int!) {\n    adjustOrderLine(orderLineId: $lineId, quantity: $quantity) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation AdjustLine($lineId: ID!, $quantity: Int!) {\n    adjustOrderLine(orderLineId: $lineId, quantity: $quantity) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RemoveLine($lineId: ID!) {\n    removeOrderLine(orderLineId: $lineId) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation RemoveLine($lineId: ID!) {\n    removeOrderLine(orderLineId: $lineId) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ApplyCoupon($code: String!) {\n    applyCouponCode(couponCode: $code) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation ApplyCoupon($code: String!) {\n    applyCouponCode(couponCode: $code) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RemoveCoupon($code: String!) {\n    removeCouponCode(couponCode: $code) {\n      ...Cart\n    }\n  }\n',
): (typeof documents)['\n  mutation RemoveCoupon($code: String!) {\n    removeCouponCode(couponCode: $code) {\n      ...Cart\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Products($options: ProductListOptions) {\n    products(options: $options) {\n      totalItems\n      items {\n        ...ProductSummary\n      }\n    }\n  }\n',
): (typeof documents)['\n  query Products($options: ProductListOptions) {\n    products(options: $options) {\n      totalItems\n      items {\n        ...ProductSummary\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Product($slug: String) {\n    product(slug: $slug) {\n      ...ProductSummary\n      assets {\n        preview\n        source\n      }\n      collections {\n        id\n        slug\n        name\n      }\n    }\n  }\n',
): (typeof documents)['\n  query Product($slug: String) {\n    product(slug: $slug) {\n      ...ProductSummary\n      assets {\n        preview\n        source\n      }\n      collections {\n        id\n        slug\n        name\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Search($input: SearchInput!) {\n    search(input: $input) {\n      totalItems\n      items {\n        productId\n        productName\n        slug\n        description\n        productAsset {\n          preview\n        }\n        priceWithTax {\n          ... on SinglePrice {\n            value\n          }\n          ... on PriceRange {\n            min\n            max\n          }\n        }\n        currencyCode\n      }\n      facetValues {\n        count\n        facetValue {\n          id\n          name\n          facet {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query Search($input: SearchInput!) {\n    search(input: $input) {\n      totalItems\n      items {\n        productId\n        productName\n        slug\n        description\n        productAsset {\n          preview\n        }\n        priceWithTax {\n          ... on SinglePrice {\n            value\n          }\n          ... on PriceRange {\n            min\n            max\n          }\n        }\n        currencyCode\n      }\n      facetValues {\n        count\n        facetValue {\n          id\n          name\n          facet {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Collections($options: CollectionListOptions) {\n    collections(options: $options) {\n      totalItems\n      items {\n        id\n        slug\n        name\n        parentId\n        featuredAsset {\n          preview\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query Collections($options: CollectionListOptions) {\n    collections(options: $options) {\n      totalItems\n      items {\n        id\n        slug\n        name\n        parentId\n        featuredAsset {\n          preview\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Collection($slug: String) {\n    collection(slug: $slug) {\n      id\n      slug\n      name\n      description\n      breadcrumbs {\n        id\n        slug\n        name\n      }\n    }\n  }\n',
): (typeof documents)['\n  query Collection($slug: String) {\n    collection(slug: $slug) {\n      id\n      slug\n      name\n      description\n      breadcrumbs {\n        id\n        slug\n        name\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation SetCustomer($input: CreateCustomerInput!) {\n    setCustomerForOrder(input: $input) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation SetCustomer($input: CreateCustomerInput!) {\n    setCustomerForOrder(input: $input) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation SetShippingAddress($input: CreateAddressInput!) {\n    setOrderShippingAddress(input: $input) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation SetShippingAddress($input: CreateAddressInput!) {\n    setOrderShippingAddress(input: $input) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation SetBillingAddress($input: CreateAddressInput!) {\n    setOrderBillingAddress(input: $input) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation SetBillingAddress($input: CreateAddressInput!) {\n    setOrderBillingAddress(input: $input) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query EligibleShippingMethods {\n    eligibleShippingMethods {\n      id\n      code\n      name\n      description\n      price\n      priceWithTax\n    }\n  }\n',
): (typeof documents)['\n  query EligibleShippingMethods {\n    eligibleShippingMethods {\n      id\n      code\n      name\n      description\n      price\n      priceWithTax\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation SetShippingMethod($ids: [ID!]!) {\n    setOrderShippingMethod(shippingMethodId: $ids) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation SetShippingMethod($ids: [ID!]!) {\n    setOrderShippingMethod(shippingMethodId: $ids) {\n      __typename\n      ...Cart\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation TransitionOrder($state: String!) {\n    transitionOrderToState(state: $state) {\n      __typename\n      ...Cart\n      ... on OrderStateTransitionError {\n        errorCode\n        message\n        transitionError\n        fromState\n        toState\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation TransitionOrder($state: String!) {\n    transitionOrderToState(state: $state) {\n      __typename\n      ...Cart\n      ... on OrderStateTransitionError {\n        errorCode\n        message\n        transitionError\n        fromState\n        toState\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateMercadoPagoCheckout($input: MercadoPagoCheckoutInput!) {\n    createMercadoPagoCheckout(input: $input) {\n      __typename\n      ... on MercadoPagoCheckout {\n        preferenceId\n        initPoint\n        sandboxInitPoint\n        expiresAt\n      }\n      ... on MercadoPagoError {\n        errorCode\n        message\n        reason\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateMercadoPagoCheckout($input: MercadoPagoCheckoutInput!) {\n    createMercadoPagoCheckout(input: $input) {\n      __typename\n      ... on MercadoPagoCheckout {\n        preferenceId\n        initPoint\n        sandboxInitPoint\n        expiresAt\n      }\n      ... on MercadoPagoError {\n        errorCode\n        message\n        reason\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation SyncMercadoPagoPayment($externalReference: String!, $paymentId: String!) {\n    syncMercadoPagoPayment(externalReference: $externalReference, paymentId: $paymentId) {\n      __typename\n      ... on MercadoPagoPaymentSync {\n        outcome\n        orderCode\n        orderState\n      }\n      ... on MercadoPagoError {\n        errorCode\n        message\n        reason\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation SyncMercadoPagoPayment($externalReference: String!, $paymentId: String!) {\n    syncMercadoPagoPayment(externalReference: $externalReference, paymentId: $paymentId) {\n      __typename\n      ... on MercadoPagoPaymentSync {\n        outcome\n        orderCode\n        orderState\n      }\n      ... on MercadoPagoError {\n        errorCode\n        message\n        reason\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query OrderByCode($code: String!) {\n    orderByCode(code: $code) {\n      ...Cart\n    }\n  }\n',
): (typeof documents)['\n  query OrderByCode($code: String!) {\n    orderByCode(code: $code) {\n      ...Cart\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query EligiblePaymentMethods {\n    eligiblePaymentMethods {\n      code\n      name\n      isEligible\n    }\n  }\n',
): (typeof documents)['\n  query EligiblePaymentMethods {\n    eligiblePaymentMethods {\n      code\n      name\n      isEligible\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  fragment Cart on Order {\n    id\n    code\n    state\n    active\n    currencyCode\n    totalQuantity\n    subTotalWithTax\n    shippingWithTax\n    totalWithTax\n    couponCodes\n    discounts {\n      description\n      amountWithTax\n    }\n    customer {\n      emailAddress\n      firstName\n      lastName\n    }\n    shippingAddress {\n      fullName\n      company\n      streetLine1\n      streetLine2\n      city\n      province\n      postalCode\n      countryCode\n      phoneNumber\n    }\n    shippingLines {\n      priceWithTax\n      shippingMethod {\n        id\n        code\n        name\n      }\n    }\n    lines {\n      id\n      quantity\n      unitPriceWithTax\n      linePriceWithTax\n      discountedLinePriceWithTax\n      productVariant {\n        id\n        name\n        sku\n        currencyCode\n        product {\n          slug\n        }\n      }\n      featuredAsset {\n        preview\n      }\n    }\n    payments {\n      id\n      state\n      transactionId\n      amount\n    }\n  }\n',
): (typeof documents)['\n  fragment Cart on Order {\n    id\n    code\n    state\n    active\n    currencyCode\n    totalQuantity\n    subTotalWithTax\n    shippingWithTax\n    totalWithTax\n    couponCodes\n    discounts {\n      description\n      amountWithTax\n    }\n    customer {\n      emailAddress\n      firstName\n      lastName\n    }\n    shippingAddress {\n      fullName\n      company\n      streetLine1\n      streetLine2\n      city\n      province\n      postalCode\n      countryCode\n      phoneNumber\n    }\n    shippingLines {\n      priceWithTax\n      shippingMethod {\n        id\n        code\n        name\n      }\n    }\n    lines {\n      id\n      quantity\n      unitPriceWithTax\n      linePriceWithTax\n      discountedLinePriceWithTax\n      productVariant {\n        id\n        name\n        sku\n        currencyCode\n        product {\n          slug\n        }\n      }\n      featuredAsset {\n        preview\n      }\n    }\n    payments {\n      id\n      state\n      transactionId\n      amount\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  fragment ProductSummary on Product {\n    id\n    name\n    slug\n    description\n    featuredAsset {\n      preview\n    }\n    variants {\n      id\n      name\n      sku\n      priceWithTax\n      currencyCode\n      stockLevel\n    }\n  }\n',
): (typeof documents)['\n  fragment ProductSummary on Product {\n    id\n    name\n    slug\n    description\n    featuredAsset {\n      preview\n    }\n    variants {\n      id\n      name\n      sku\n      priceWithTax\n      currencyCode\n      stockLevel\n    }\n  }\n'];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never;
