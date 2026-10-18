/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
/** Operators for filtering on a Boolean field */
export type BooleanOperators = {
  eq?: boolean | null | undefined;
  isNull?: boolean | null | undefined;
};

export type CollectionFilterParameter = {
  _and?: Array<CollectionFilterParameter> | null | undefined;
  _or?: Array<CollectionFilterParameter> | null | undefined;
  createdAt?: DateOperators | null | undefined;
  description?: StringOperators | null | undefined;
  id?: IdOperators | null | undefined;
  languageCode?: StringOperators | null | undefined;
  name?: StringOperators | null | undefined;
  parentId?: IdOperators | null | undefined;
  position?: NumberOperators | null | undefined;
  productVariantCount?: NumberOperators | null | undefined;
  slug?: StringOperators | null | undefined;
  updatedAt?: DateOperators | null | undefined;
};

export type CollectionListOptions = {
  /** Allows the results to be filtered */
  filter?: CollectionFilterParameter | null | undefined;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: LogicalOperator | null | undefined;
  /** Skips the first n results, for use in pagination */
  skip?: number | null | undefined;
  /** Specifies which properties to sort the results by */
  sort?: CollectionSortParameter | null | undefined;
  /** Takes n results, for use in pagination */
  take?: number | null | undefined;
  topLevelOnly?: boolean | null | undefined;
};

export type CollectionSortParameter = {
  createdAt?: SortOrder | null | undefined;
  description?: SortOrder | null | undefined;
  id?: SortOrder | null | undefined;
  name?: SortOrder | null | undefined;
  parentId?: SortOrder | null | undefined;
  position?: SortOrder | null | undefined;
  productVariantCount?: SortOrder | null | undefined;
  slug?: SortOrder | null | undefined;
  updatedAt?: SortOrder | null | undefined;
};

/**
 * Input used to create an Address.
 *
 * The countryCode must correspond to a `code` property of a Country that has been defined in the
 * Vendure server. The `code` property is typically a 2-character ISO code such as "GB", "US", "DE" etc.
 * If an invalid code is passed, the mutation will fail.
 */
export type CreateAddressInput = {
  city?: string | null | undefined;
  company?: string | null | undefined;
  countryCode: string;
  customFields?: unknown;
  defaultBillingAddress?: boolean | null | undefined;
  defaultShippingAddress?: boolean | null | undefined;
  fullName?: string | null | undefined;
  phoneNumber?: string | null | undefined;
  postalCode?: string | null | undefined;
  province?: string | null | undefined;
  streetLine1: string;
  streetLine2?: string | null | undefined;
};

export type CreateCustomerInput = {
  customFields?: unknown;
  emailAddress: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null | undefined;
  title?: string | null | undefined;
};

/**
 * @description
 * ISO 4217 currency code
 *
 * @docsCategory common
 */
export type CurrencyCode =
  /** United Arab Emirates dirham */
  | 'AED'
  /** Afghan afghani */
  | 'AFN'
  /** Albanian lek */
  | 'ALL'
  /** Armenian dram */
  | 'AMD'
  /** Netherlands Antillean guilder */
  | 'ANG'
  /** Angolan kwanza */
  | 'AOA'
  /** Argentine peso */
  | 'ARS'
  /** Australian dollar */
  | 'AUD'
  /** Aruban florin */
  | 'AWG'
  /** Azerbaijani manat */
  | 'AZN'
  /** Bosnia and Herzegovina convertible mark */
  | 'BAM'
  /** Barbados dollar */
  | 'BBD'
  /** Bangladeshi taka */
  | 'BDT'
  /** Bulgarian lev */
  | 'BGN'
  /** Bahraini dinar */
  | 'BHD'
  /** Burundian franc */
  | 'BIF'
  /** Bermudian dollar */
  | 'BMD'
  /** Brunei dollar */
  | 'BND'
  /** Boliviano */
  | 'BOB'
  /** Brazilian real */
  | 'BRL'
  /** Bahamian dollar */
  | 'BSD'
  /** Bhutanese ngultrum */
  | 'BTN'
  /** Botswana pula */
  | 'BWP'
  /** Belarusian ruble */
  | 'BYN'
  /** Belize dollar */
  | 'BZD'
  /** Canadian dollar */
  | 'CAD'
  /** Congolese franc */
  | 'CDF'
  /** Swiss franc */
  | 'CHF'
  /** Chilean peso */
  | 'CLP'
  /** Renminbi (Chinese) yuan */
  | 'CNY'
  /** Colombian peso */
  | 'COP'
  /** Costa Rican colon */
  | 'CRC'
  /** Cuban convertible peso */
  | 'CUC'
  /** Cuban peso */
  | 'CUP'
  /** Cape Verde escudo */
  | 'CVE'
  /** Czech koruna */
  | 'CZK'
  /** Djiboutian franc */
  | 'DJF'
  /** Danish krone */
  | 'DKK'
  /** Dominican peso */
  | 'DOP'
  /** Algerian dinar */
  | 'DZD'
  /** Egyptian pound */
  | 'EGP'
  /** Eritrean nakfa */
  | 'ERN'
  /** Ethiopian birr */
  | 'ETB'
  /** Euro */
  | 'EUR'
  /** Fiji dollar */
  | 'FJD'
  /** Falkland Islands pound */
  | 'FKP'
  /** Pound sterling */
  | 'GBP'
  /** Georgian lari */
  | 'GEL'
  /** Ghanaian cedi */
  | 'GHS'
  /** Gibraltar pound */
  | 'GIP'
  /** Gambian dalasi */
  | 'GMD'
  /** Guinean franc */
  | 'GNF'
  /** Guatemalan quetzal */
  | 'GTQ'
  /** Guyanese dollar */
  | 'GYD'
  /** Hong Kong dollar */
  | 'HKD'
  /** Honduran lempira */
  | 'HNL'
  /** Croatian kuna */
  | 'HRK'
  /** Haitian gourde */
  | 'HTG'
  /** Hungarian forint */
  | 'HUF'
  /** Indonesian rupiah */
  | 'IDR'
  /** Israeli new shekel */
  | 'ILS'
  /** Indian rupee */
  | 'INR'
  /** Iraqi dinar */
  | 'IQD'
  /** Iranian rial */
  | 'IRR'
  /** Icelandic króna */
  | 'ISK'
  /** Jamaican dollar */
  | 'JMD'
  /** Jordanian dinar */
  | 'JOD'
  /** Japanese yen */
  | 'JPY'
  /** Kenyan shilling */
  | 'KES'
  /** Kyrgyzstani som */
  | 'KGS'
  /** Cambodian riel */
  | 'KHR'
  /** Comoro franc */
  | 'KMF'
  /** North Korean won */
  | 'KPW'
  /** South Korean won */
  | 'KRW'
  /** Kuwaiti dinar */
  | 'KWD'
  /** Cayman Islands dollar */
  | 'KYD'
  /** Kazakhstani tenge */
  | 'KZT'
  /** Lao kip */
  | 'LAK'
  /** Lebanese pound */
  | 'LBP'
  /** Sri Lankan rupee */
  | 'LKR'
  /** Liberian dollar */
  | 'LRD'
  /** Lesotho loti */
  | 'LSL'
  /** Libyan dinar */
  | 'LYD'
  /** Moroccan dirham */
  | 'MAD'
  /** Moldovan leu */
  | 'MDL'
  /** Malagasy ariary */
  | 'MGA'
  /** Macedonian denar */
  | 'MKD'
  /** Myanmar kyat */
  | 'MMK'
  /** Mongolian tögrög */
  | 'MNT'
  /** Macanese pataca */
  | 'MOP'
  /** Mauritanian ouguiya */
  | 'MRU'
  /** Mauritian rupee */
  | 'MUR'
  /** Maldivian rufiyaa */
  | 'MVR'
  /** Malawian kwacha */
  | 'MWK'
  /** Mexican peso */
  | 'MXN'
  /** Malaysian ringgit */
  | 'MYR'
  /** Mozambican metical */
  | 'MZN'
  /** Namibian dollar */
  | 'NAD'
  /** Nigerian naira */
  | 'NGN'
  /** Nicaraguan córdoba */
  | 'NIO'
  /** Norwegian krone */
  | 'NOK'
  /** Nepalese rupee */
  | 'NPR'
  /** New Zealand dollar */
  | 'NZD'
  /** Omani rial */
  | 'OMR'
  /** Panamanian balboa */
  | 'PAB'
  /** Peruvian sol */
  | 'PEN'
  /** Papua New Guinean kina */
  | 'PGK'
  /** Philippine peso */
  | 'PHP'
  /** Pakistani rupee */
  | 'PKR'
  /** Polish złoty */
  | 'PLN'
  /** Paraguayan guaraní */
  | 'PYG'
  /** Qatari riyal */
  | 'QAR'
  /** Romanian leu */
  | 'RON'
  /** Serbian dinar */
  | 'RSD'
  /** Russian ruble */
  | 'RUB'
  /** Rwandan franc */
  | 'RWF'
  /** Saudi riyal */
  | 'SAR'
  /** Solomon Islands dollar */
  | 'SBD'
  /** Seychelles rupee */
  | 'SCR'
  /** Sudanese pound */
  | 'SDG'
  /** Swedish krona/kronor */
  | 'SEK'
  /** Singapore dollar */
  | 'SGD'
  /** Saint Helena pound */
  | 'SHP'
  /** Sierra Leonean leone */
  | 'SLL'
  /** Somali shilling */
  | 'SOS'
  /** Surinamese dollar */
  | 'SRD'
  /** South Sudanese pound */
  | 'SSP'
  /** São Tomé and Príncipe dobra */
  | 'STN'
  /** Salvadoran colón */
  | 'SVC'
  /** Syrian pound */
  | 'SYP'
  /** Swazi lilangeni */
  | 'SZL'
  /** Thai baht */
  | 'THB'
  /** Tajikistani somoni */
  | 'TJS'
  /** Turkmenistan manat */
  | 'TMT'
  /** Tunisian dinar */
  | 'TND'
  /** Tongan paʻanga */
  | 'TOP'
  /** Turkish lira */
  | 'TRY'
  /** Trinidad and Tobago dollar */
  | 'TTD'
  /** New Taiwan dollar */
  | 'TWD'
  /** Tanzanian shilling */
  | 'TZS'
  /** Ukrainian hryvnia */
  | 'UAH'
  /** Ugandan shilling */
  | 'UGX'
  /** United States dollar */
  | 'USD'
  /** Uruguayan peso */
  | 'UYU'
  /** Uzbekistan som */
  | 'UZS'
  /** Venezuelan bolívar soberano */
  | 'VES'
  /** Vietnamese đồng */
  | 'VND'
  /** Vanuatu vatu */
  | 'VUV'
  /** Samoan tala */
  | 'WST'
  /** CFA franc BEAC */
  | 'XAF'
  /** East Caribbean dollar */
  | 'XCD'
  /** CFA franc BCEAO */
  | 'XOF'
  /** CFP franc (franc Pacifique) */
  | 'XPF'
  /** Yemeni rial */
  | 'YER'
  /** South African rand */
  | 'ZAR'
  /** Zambian kwacha */
  | 'ZMW'
  /** Zimbabwean dollar */
  | 'ZWL';

/** Operators for filtering on a DateTime field */
export type DateOperators = {
  after?: string | null | undefined;
  before?: string | null | undefined;
  between?: DateRange | null | undefined;
  eq?: string | null | undefined;
  isNull?: boolean | null | undefined;
};

export type DateRange = {
  end: string;
  start: string;
};

export type ErrorCode =
  | 'ALREADY_LOGGED_IN_ERROR'
  | 'COUPON_CODE_EXPIRED_ERROR'
  | 'COUPON_CODE_INVALID_ERROR'
  | 'COUPON_CODE_LIMIT_ERROR'
  | 'COUPON_REMOVED_DURING_CHECKOUT_ERROR'
  | 'EMAIL_ADDRESS_CONFLICT_ERROR'
  | 'GUEST_CHECKOUT_ERROR'
  | 'IDENTIFIER_CHANGE_TOKEN_EXPIRED_ERROR'
  | 'IDENTIFIER_CHANGE_TOKEN_INVALID_ERROR'
  | 'INELIGIBLE_PAYMENT_METHOD_ERROR'
  | 'INELIGIBLE_SHIPPING_METHOD_ERROR'
  | 'INSUFFICIENT_STOCK_ERROR'
  | 'INVALID_CREDENTIALS_ERROR'
  | 'MERCADOPAGO_ERROR'
  | 'MERCADO_PAGO_ERROR'
  | 'MISSING_PASSWORD_ERROR'
  | 'NATIVE_AUTH_STRATEGY_ERROR'
  | 'NEGATIVE_QUANTITY_ERROR'
  | 'NOT_VERIFIED_ERROR'
  | 'NO_ACTIVE_ORDER_ERROR'
  | 'ORDER_INTERCEPTOR_ERROR'
  | 'ORDER_LIMIT_ERROR'
  | 'ORDER_MODIFICATION_ERROR'
  | 'ORDER_PAYMENT_STATE_ERROR'
  | 'ORDER_STATE_TRANSITION_ERROR'
  | 'PASSWORD_ALREADY_SET_ERROR'
  | 'PASSWORD_RESET_TOKEN_EXPIRED_ERROR'
  | 'PASSWORD_RESET_TOKEN_INVALID_ERROR'
  | 'PASSWORD_VALIDATION_ERROR'
  | 'PAYMENT_DECLINED_ERROR'
  | 'PAYMENT_FAILED_ERROR'
  | 'UNKNOWN_ERROR'
  | 'VERIFICATION_TOKEN_EXPIRED_ERROR'
  | 'VERIFICATION_TOKEN_INVALID_ERROR';

/**
 * Used to construct boolean expressions for filtering search results
 * by FacetValue ID. Examples:
 *
 * * ID=1 OR ID=2: `{ facetValueFilters: [{ or: [1,2] }] }`
 * * ID=1 AND ID=2: `{ facetValueFilters: [{ and: 1 }, { and: 2 }] }`
 * * ID=1 AND (ID=2 OR ID=3): `{ facetValueFilters: [{ and: 1 }, { or: [2,3] }] }`
 */
export type FacetValueFilterInput = {
  and?: string | number | null | undefined;
  or?: Array<string | number> | null | undefined;
};

/** Operators for filtering on an ID field */
export type IdOperators = {
  eq?: string | null | undefined;
  in?: Array<string> | null | undefined;
  isNull?: boolean | null | undefined;
  notEq?: string | null | undefined;
  notIn?: Array<string> | null | undefined;
};

export type LogicalOperator = 'AND' | 'OR';

export type MercadoPagoCheckoutInput = {
  failureUrl: string;
  /** Code of the active order. It must be in the ArrangingPayment state. */
  orderCode: string;
  pendingUrl: string;
  /** Pages of the store's storefront Mercado Pago sends the buyer back to. */
  successUrl: string;
};

/** Operators for filtering on a Int or Float field */
export type NumberOperators = {
  between?: NumberRange | null | undefined;
  eq?: number | null | undefined;
  gt?: number | null | undefined;
  gte?: number | null | undefined;
  isNull?: boolean | null | undefined;
  lt?: number | null | undefined;
  lte?: number | null | undefined;
};

export type NumberRange = {
  end: number;
  start: number;
};

export type OrderFilterParameter = {
  _and?: Array<OrderFilterParameter> | null | undefined;
  _or?: Array<OrderFilterParameter> | null | undefined;
  /** An order is active as long as the payment process has not been completed */
  active?: BooleanOperators | null | undefined;
  /** A unique code for the Order */
  code?: StringOperators | null | undefined;
  createdAt?: DateOperators | null | undefined;
  currencyCode?: StringOperators | null | undefined;
  id?: IdOperators | null | undefined;
  /**
   * The date & time that the Order was placed, i.e. the Customer
   * completed the checkout and the Order is no longer "active"
   */
  orderPlacedAt?: DateOperators | null | undefined;
  shipping?: NumberOperators | null | undefined;
  shippingWithTax?: NumberOperators | null | undefined;
  state?: StringOperators | null | undefined;
  /**
   * The subTotal is the total of all OrderLines in the Order. This figure also includes any Order-level
   * discounts which have been prorated (proportionally distributed) amongst the items of each OrderLine.
   * To get a total of all OrderLines which does not account for prorated discounts, use the
   * sum of `OrderLine.discountedLinePrice` values.
   */
  subTotal?: NumberOperators | null | undefined;
  /** Same as subTotal, but inclusive of tax */
  subTotalWithTax?: NumberOperators | null | undefined;
  /** Equal to subTotal plus shipping */
  total?: NumberOperators | null | undefined;
  totalQuantity?: NumberOperators | null | undefined;
  /** The final payable amount. Equal to subTotalWithTax plus shippingWithTax */
  totalWithTax?: NumberOperators | null | undefined;
  type?: StringOperators | null | undefined;
  updatedAt?: DateOperators | null | undefined;
};

export type OrderListOptions = {
  /** Allows the results to be filtered */
  filter?: OrderFilterParameter | null | undefined;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: LogicalOperator | null | undefined;
  /** Skips the first n results, for use in pagination */
  skip?: number | null | undefined;
  /** Specifies which properties to sort the results by */
  sort?: OrderSortParameter | null | undefined;
  /** Takes n results, for use in pagination */
  take?: number | null | undefined;
};

export type OrderSortParameter = {
  /** A unique code for the Order */
  code?: SortOrder | null | undefined;
  createdAt?: SortOrder | null | undefined;
  id?: SortOrder | null | undefined;
  /**
   * The date & time that the Order was placed, i.e. the Customer
   * completed the checkout and the Order is no longer "active"
   */
  orderPlacedAt?: SortOrder | null | undefined;
  shipping?: SortOrder | null | undefined;
  shippingWithTax?: SortOrder | null | undefined;
  state?: SortOrder | null | undefined;
  /**
   * The subTotal is the total of all OrderLines in the Order. This figure also includes any Order-level
   * discounts which have been prorated (proportionally distributed) amongst the items of each OrderLine.
   * To get a total of all OrderLines which does not account for prorated discounts, use the
   * sum of `OrderLine.discountedLinePrice` values.
   */
  subTotal?: SortOrder | null | undefined;
  /** Same as subTotal, but inclusive of tax */
  subTotalWithTax?: SortOrder | null | undefined;
  /** Equal to subTotal plus shipping */
  total?: SortOrder | null | undefined;
  totalQuantity?: SortOrder | null | undefined;
  /** The final payable amount. Equal to subTotalWithTax plus shippingWithTax */
  totalWithTax?: SortOrder | null | undefined;
  updatedAt?: SortOrder | null | undefined;
};

export type ProductFilterParameter = {
  _and?: Array<ProductFilterParameter> | null | undefined;
  _or?: Array<ProductFilterParameter> | null | undefined;
  createdAt?: DateOperators | null | undefined;
  description?: StringOperators | null | undefined;
  enabled?: BooleanOperators | null | undefined;
  id?: IdOperators | null | undefined;
  languageCode?: StringOperators | null | undefined;
  name?: StringOperators | null | undefined;
  slug?: StringOperators | null | undefined;
  updatedAt?: DateOperators | null | undefined;
};

export type ProductListOptions = {
  /** Allows the results to be filtered */
  filter?: ProductFilterParameter | null | undefined;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: LogicalOperator | null | undefined;
  /** Skips the first n results, for use in pagination */
  skip?: number | null | undefined;
  /** Specifies which properties to sort the results by */
  sort?: ProductSortParameter | null | undefined;
  /** Takes n results, for use in pagination */
  take?: number | null | undefined;
};

export type ProductSortParameter = {
  createdAt?: SortOrder | null | undefined;
  description?: SortOrder | null | undefined;
  id?: SortOrder | null | undefined;
  name?: SortOrder | null | undefined;
  slug?: SortOrder | null | undefined;
  updatedAt?: SortOrder | null | undefined;
};

export type RegisterCustomerInput = {
  emailAddress: string;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  password?: string | null | undefined;
  phoneNumber?: string | null | undefined;
  title?: string | null | undefined;
};

export type SearchInput = {
  collectionId?: string | number | null | undefined;
  collectionIds?: Array<string | number> | null | undefined;
  collectionSlug?: string | null | undefined;
  collectionSlugs?: Array<string> | null | undefined;
  facetValueFilters?: Array<FacetValueFilterInput> | null | undefined;
  groupByProduct?: boolean | null | undefined;
  inStock?: boolean | null | undefined;
  skip?: number | null | undefined;
  sort?: SearchResultSortParameter | null | undefined;
  take?: number | null | undefined;
  term?: string | null | undefined;
};

export type SearchResultSortParameter = {
  name?: SortOrder | null | undefined;
  price?: SortOrder | null | undefined;
};

export type SortOrder = 'ASC' | 'DESC';

/** Operators for filtering on a String field */
export type StringOperators = {
  contains?: string | null | undefined;
  eq?: string | null | undefined;
  in?: Array<string> | null | undefined;
  isNull?: boolean | null | undefined;
  notContains?: string | null | undefined;
  notEq?: string | null | undefined;
  notIn?: Array<string> | null | undefined;
  regex?: string | null | undefined;
};

export type RegisterMutationVariables = Exact<{
  input: RegisterCustomerInput;
}>;

export type RegisterMutation = {
  registerCustomerAccount:
    | { __typename: 'MissingPasswordError'; errorCode: ErrorCode; message: string }
    | { __typename: 'NativeAuthStrategyError'; errorCode: ErrorCode; message: string }
    | { __typename: 'PasswordValidationError'; errorCode: ErrorCode; message: string }
    | { __typename: 'Success'; success: boolean };
};

export type LoginMutationVariables = Exact<{
  email: string;
  password: string;
  rememberMe?: boolean | null | undefined;
}>;

export type LoginMutation = {
  login:
    | { __typename: 'CurrentUser'; id: string; identifier: string }
    | { __typename: 'InvalidCredentialsError'; errorCode: ErrorCode; message: string }
    | { __typename: 'NativeAuthStrategyError'; errorCode: ErrorCode; message: string }
    | { __typename: 'NotVerifiedError'; errorCode: ErrorCode; message: string };
};

export type LogoutMutationVariables = Exact<{ [key: string]: never }>;

export type LogoutMutation = { logout: { success: boolean } };

export type ActiveCustomerQueryVariables = Exact<{ [key: string]: never }>;

export type ActiveCustomerQuery = {
  activeCustomer: {
    id: string;
    emailAddress: string;
    firstName: string;
    lastName: string;
    phoneNumber: string | null;
  } | null;
};

export type CustomerOrdersQueryVariables = Exact<{
  options?: OrderListOptions | null | undefined;
}>;

export type CustomerOrdersQuery = {
  activeCustomer: {
    id: string;
    orders: {
      totalItems: number;
      items: Array<{
        id: string;
        code: string;
        state: string;
        orderPlacedAt: string | null;
        currencyCode: CurrencyCode;
        totalQuantity: number;
        totalWithTax: number;
      }>;
    };
  } | null;
};

export type VerifyEmailMutationVariables = Exact<{
  token: string;
  password?: string | null | undefined;
}>;

export type VerifyEmailMutation = {
  verifyCustomerAccount:
    | { __typename: 'CurrentUser'; id: string }
    | { __typename: 'MissingPasswordError'; errorCode: ErrorCode; message: string }
    | { __typename: 'NativeAuthStrategyError'; errorCode: ErrorCode; message: string }
    | { __typename: 'PasswordAlreadySetError'; errorCode: ErrorCode; message: string }
    | { __typename: 'PasswordValidationError'; errorCode: ErrorCode; message: string }
    | { __typename: 'VerificationTokenExpiredError'; errorCode: ErrorCode; message: string }
    | { __typename: 'VerificationTokenInvalidError'; errorCode: ErrorCode; message: string };
};

export type RequestPasswordResetMutationVariables = Exact<{
  email: string;
}>;

export type RequestPasswordResetMutation = {
  requestPasswordReset:
    | { __typename: 'NativeAuthStrategyError'; errorCode: ErrorCode; message: string }
    | { __typename: 'Success'; success: boolean }
    | null;
};

export type ResetPasswordMutationVariables = Exact<{
  token: string;
  password: string;
}>;

export type ResetPasswordMutation = {
  resetPassword:
    | { __typename: 'CurrentUser'; id: string }
    | { __typename: 'NativeAuthStrategyError'; errorCode: ErrorCode; message: string }
    | { __typename: 'NotVerifiedError'; errorCode: ErrorCode; message: string }
    | { __typename: 'PasswordResetTokenExpiredError'; errorCode: ErrorCode; message: string }
    | { __typename: 'PasswordResetTokenInvalidError'; errorCode: ErrorCode; message: string }
    | { __typename: 'PasswordValidationError'; errorCode: ErrorCode; message: string };
};

export type ActiveOrderQueryVariables = Exact<{ [key: string]: never }>;

export type ActiveOrderQuery = {
  activeOrder: {
    id: string;
    code: string;
    state: string;
    active: boolean;
    currencyCode: CurrencyCode;
    totalQuantity: number;
    subTotalWithTax: number;
    shippingWithTax: number;
    totalWithTax: number;
    couponCodes: Array<string>;
    discounts: Array<{ description: string; amountWithTax: number }>;
    customer: { emailAddress: string; firstName: string; lastName: string } | null;
    shippingAddress: {
      fullName: string | null;
      company: string | null;
      streetLine1: string | null;
      streetLine2: string | null;
      city: string | null;
      province: string | null;
      postalCode: string | null;
      countryCode: string | null;
      phoneNumber: string | null;
    } | null;
    shippingLines: Array<{
      priceWithTax: number;
      shippingMethod: { id: string; code: string; name: string };
    }>;
    lines: Array<{
      id: string;
      quantity: number;
      unitPriceWithTax: number;
      linePriceWithTax: number;
      discountedLinePriceWithTax: number;
      productVariant: {
        id: string;
        name: string;
        sku: string;
        currencyCode: CurrencyCode;
        product: { slug: string };
      };
      featuredAsset: { preview: string } | null;
    }>;
    payments: Array<{
      id: string;
      state: string;
      transactionId: string | null;
      amount: number;
    }> | null;
  } | null;
};

export type AddItemMutationVariables = Exact<{
  variantId: string | number;
  quantity: number;
}>;

export type AddItemMutation = {
  addItemToOrder:
    | { __typename: 'InsufficientStockError'; errorCode: ErrorCode; message: string }
    | { __typename: 'NegativeQuantityError'; errorCode: ErrorCode; message: string }
    | {
        __typename: 'Order';
        id: string;
        code: string;
        state: string;
        active: boolean;
        currencyCode: CurrencyCode;
        totalQuantity: number;
        subTotalWithTax: number;
        shippingWithTax: number;
        totalWithTax: number;
        couponCodes: Array<string>;
        discounts: Array<{ description: string; amountWithTax: number }>;
        customer: { emailAddress: string; firstName: string; lastName: string } | null;
        shippingAddress: {
          fullName: string | null;
          company: string | null;
          streetLine1: string | null;
          streetLine2: string | null;
          city: string | null;
          province: string | null;
          postalCode: string | null;
          countryCode: string | null;
          phoneNumber: string | null;
        } | null;
        shippingLines: Array<{
          priceWithTax: number;
          shippingMethod: { id: string; code: string; name: string };
        }>;
        lines: Array<{
          id: string;
          quantity: number;
          unitPriceWithTax: number;
          linePriceWithTax: number;
          discountedLinePriceWithTax: number;
          productVariant: {
            id: string;
            name: string;
            sku: string;
            currencyCode: CurrencyCode;
            product: { slug: string };
          };
          featuredAsset: { preview: string } | null;
        }>;
        payments: Array<{
          id: string;
          state: string;
          transactionId: string | null;
          amount: number;
        }> | null;
      }
    | { __typename: 'OrderInterceptorError'; errorCode: ErrorCode; message: string }
    | { __typename: 'OrderLimitError'; errorCode: ErrorCode; message: string }
    | { __typename: 'OrderModificationError'; errorCode: ErrorCode; message: string };
};

export type AdjustLineMutationVariables = Exact<{
  lineId: string | number;
  quantity: number;
}>;

export type AdjustLineMutation = {
  adjustOrderLine:
    | { __typename: 'InsufficientStockError'; errorCode: ErrorCode; message: string }
    | { __typename: 'NegativeQuantityError'; errorCode: ErrorCode; message: string }
    | {
        __typename: 'Order';
        id: string;
        code: string;
        state: string;
        active: boolean;
        currencyCode: CurrencyCode;
        totalQuantity: number;
        subTotalWithTax: number;
        shippingWithTax: number;
        totalWithTax: number;
        couponCodes: Array<string>;
        discounts: Array<{ description: string; amountWithTax: number }>;
        customer: { emailAddress: string; firstName: string; lastName: string } | null;
        shippingAddress: {
          fullName: string | null;
          company: string | null;
          streetLine1: string | null;
          streetLine2: string | null;
          city: string | null;
          province: string | null;
          postalCode: string | null;
          countryCode: string | null;
          phoneNumber: string | null;
        } | null;
        shippingLines: Array<{
          priceWithTax: number;
          shippingMethod: { id: string; code: string; name: string };
        }>;
        lines: Array<{
          id: string;
          quantity: number;
          unitPriceWithTax: number;
          linePriceWithTax: number;
          discountedLinePriceWithTax: number;
          productVariant: {
            id: string;
            name: string;
            sku: string;
            currencyCode: CurrencyCode;
            product: { slug: string };
          };
          featuredAsset: { preview: string } | null;
        }>;
        payments: Array<{
          id: string;
          state: string;
          transactionId: string | null;
          amount: number;
        }> | null;
      }
    | { __typename: 'OrderInterceptorError'; errorCode: ErrorCode; message: string }
    | { __typename: 'OrderLimitError'; errorCode: ErrorCode; message: string }
    | { __typename: 'OrderModificationError'; errorCode: ErrorCode; message: string };
};

export type RemoveLineMutationVariables = Exact<{
  lineId: string | number;
}>;

export type RemoveLineMutation = {
  removeOrderLine:
    | {
        __typename: 'Order';
        id: string;
        code: string;
        state: string;
        active: boolean;
        currencyCode: CurrencyCode;
        totalQuantity: number;
        subTotalWithTax: number;
        shippingWithTax: number;
        totalWithTax: number;
        couponCodes: Array<string>;
        discounts: Array<{ description: string; amountWithTax: number }>;
        customer: { emailAddress: string; firstName: string; lastName: string } | null;
        shippingAddress: {
          fullName: string | null;
          company: string | null;
          streetLine1: string | null;
          streetLine2: string | null;
          city: string | null;
          province: string | null;
          postalCode: string | null;
          countryCode: string | null;
          phoneNumber: string | null;
        } | null;
        shippingLines: Array<{
          priceWithTax: number;
          shippingMethod: { id: string; code: string; name: string };
        }>;
        lines: Array<{
          id: string;
          quantity: number;
          unitPriceWithTax: number;
          linePriceWithTax: number;
          discountedLinePriceWithTax: number;
          productVariant: {
            id: string;
            name: string;
            sku: string;
            currencyCode: CurrencyCode;
            product: { slug: string };
          };
          featuredAsset: { preview: string } | null;
        }>;
        payments: Array<{
          id: string;
          state: string;
          transactionId: string | null;
          amount: number;
        }> | null;
      }
    | { __typename: 'OrderInterceptorError'; errorCode: ErrorCode; message: string }
    | { __typename: 'OrderModificationError'; errorCode: ErrorCode; message: string };
};

export type ApplyCouponMutationVariables = Exact<{
  code: string;
}>;

export type ApplyCouponMutation = {
  applyCouponCode:
    | { __typename: 'CouponCodeExpiredError'; errorCode: ErrorCode; message: string }
    | { __typename: 'CouponCodeInvalidError'; errorCode: ErrorCode; message: string }
    | { __typename: 'CouponCodeLimitError'; errorCode: ErrorCode; message: string }
    | {
        __typename: 'Order';
        id: string;
        code: string;
        state: string;
        active: boolean;
        currencyCode: CurrencyCode;
        totalQuantity: number;
        subTotalWithTax: number;
        shippingWithTax: number;
        totalWithTax: number;
        couponCodes: Array<string>;
        discounts: Array<{ description: string; amountWithTax: number }>;
        customer: { emailAddress: string; firstName: string; lastName: string } | null;
        shippingAddress: {
          fullName: string | null;
          company: string | null;
          streetLine1: string | null;
          streetLine2: string | null;
          city: string | null;
          province: string | null;
          postalCode: string | null;
          countryCode: string | null;
          phoneNumber: string | null;
        } | null;
        shippingLines: Array<{
          priceWithTax: number;
          shippingMethod: { id: string; code: string; name: string };
        }>;
        lines: Array<{
          id: string;
          quantity: number;
          unitPriceWithTax: number;
          linePriceWithTax: number;
          discountedLinePriceWithTax: number;
          productVariant: {
            id: string;
            name: string;
            sku: string;
            currencyCode: CurrencyCode;
            product: { slug: string };
          };
          featuredAsset: { preview: string } | null;
        }>;
        payments: Array<{
          id: string;
          state: string;
          transactionId: string | null;
          amount: number;
        }> | null;
      };
};

export type RemoveCouponMutationVariables = Exact<{
  code: string;
}>;

export type RemoveCouponMutation = {
  removeCouponCode: {
    id: string;
    code: string;
    state: string;
    active: boolean;
    currencyCode: CurrencyCode;
    totalQuantity: number;
    subTotalWithTax: number;
    shippingWithTax: number;
    totalWithTax: number;
    couponCodes: Array<string>;
    discounts: Array<{ description: string; amountWithTax: number }>;
    customer: { emailAddress: string; firstName: string; lastName: string } | null;
    shippingAddress: {
      fullName: string | null;
      company: string | null;
      streetLine1: string | null;
      streetLine2: string | null;
      city: string | null;
      province: string | null;
      postalCode: string | null;
      countryCode: string | null;
      phoneNumber: string | null;
    } | null;
    shippingLines: Array<{
      priceWithTax: number;
      shippingMethod: { id: string; code: string; name: string };
    }>;
    lines: Array<{
      id: string;
      quantity: number;
      unitPriceWithTax: number;
      linePriceWithTax: number;
      discountedLinePriceWithTax: number;
      productVariant: {
        id: string;
        name: string;
        sku: string;
        currencyCode: CurrencyCode;
        product: { slug: string };
      };
      featuredAsset: { preview: string } | null;
    }>;
    payments: Array<{
      id: string;
      state: string;
      transactionId: string | null;
      amount: number;
    }> | null;
  } | null;
};

export type ProductsQueryVariables = Exact<{
  options?: ProductListOptions | null | undefined;
}>;

export type ProductsQuery = {
  products: {
    totalItems: number;
    items: Array<{
      id: string;
      name: string;
      slug: string;
      description: string;
      featuredAsset: { preview: string } | null;
      variants: Array<{
        id: string;
        name: string;
        sku: string;
        priceWithTax: number;
        currencyCode: CurrencyCode;
        stockLevel: string;
      }>;
    }>;
  };
};

export type ProductQueryVariables = Exact<{
  slug?: string | null | undefined;
}>;

export type ProductQuery = {
  product: {
    id: string;
    name: string;
    slug: string;
    description: string;
    assets: Array<{ preview: string; source: string }>;
    collections: Array<{ id: string; slug: string; name: string }>;
    featuredAsset: { preview: string } | null;
    variants: Array<{
      id: string;
      name: string;
      sku: string;
      priceWithTax: number;
      currencyCode: CurrencyCode;
      stockLevel: string;
    }>;
  } | null;
};

export type SearchQueryVariables = Exact<{
  input: SearchInput;
}>;

export type SearchQuery = {
  search: {
    totalItems: number;
    items: Array<{
      productId: string;
      productName: string;
      slug: string;
      description: string;
      currencyCode: CurrencyCode;
      productAsset: { preview: string } | null;
      priceWithTax: { min: number; max: number } | { value: number };
    }>;
    facetValues: Array<{
      count: number;
      facetValue: { id: string; name: string; facet: { id: string; name: string } };
    }>;
  };
};

export type CollectionsQueryVariables = Exact<{
  options?: CollectionListOptions | null | undefined;
}>;

export type CollectionsQuery = {
  collections: {
    totalItems: number;
    items: Array<{
      id: string;
      slug: string;
      name: string;
      parentId: string;
      featuredAsset: { preview: string } | null;
    }>;
  };
};

export type CollectionQueryVariables = Exact<{
  slug?: string | null | undefined;
}>;

export type CollectionQuery = {
  collection: {
    id: string;
    slug: string;
    name: string;
    description: string;
    breadcrumbs: Array<{ id: string; slug: string; name: string }>;
  } | null;
};

export type SetCustomerMutationVariables = Exact<{
  input: CreateCustomerInput;
}>;

export type SetCustomerMutation = {
  setCustomerForOrder:
    | { __typename: 'AlreadyLoggedInError'; errorCode: ErrorCode; message: string }
    | { __typename: 'EmailAddressConflictError'; errorCode: ErrorCode; message: string }
    | { __typename: 'GuestCheckoutError'; errorCode: ErrorCode; message: string }
    | { __typename: 'NoActiveOrderError'; errorCode: ErrorCode; message: string }
    | {
        __typename: 'Order';
        id: string;
        code: string;
        state: string;
        active: boolean;
        currencyCode: CurrencyCode;
        totalQuantity: number;
        subTotalWithTax: number;
        shippingWithTax: number;
        totalWithTax: number;
        couponCodes: Array<string>;
        discounts: Array<{ description: string; amountWithTax: number }>;
        customer: { emailAddress: string; firstName: string; lastName: string } | null;
        shippingAddress: {
          fullName: string | null;
          company: string | null;
          streetLine1: string | null;
          streetLine2: string | null;
          city: string | null;
          province: string | null;
          postalCode: string | null;
          countryCode: string | null;
          phoneNumber: string | null;
        } | null;
        shippingLines: Array<{
          priceWithTax: number;
          shippingMethod: { id: string; code: string; name: string };
        }>;
        lines: Array<{
          id: string;
          quantity: number;
          unitPriceWithTax: number;
          linePriceWithTax: number;
          discountedLinePriceWithTax: number;
          productVariant: {
            id: string;
            name: string;
            sku: string;
            currencyCode: CurrencyCode;
            product: { slug: string };
          };
          featuredAsset: { preview: string } | null;
        }>;
        payments: Array<{
          id: string;
          state: string;
          transactionId: string | null;
          amount: number;
        }> | null;
      };
};

export type SetShippingAddressMutationVariables = Exact<{
  input: CreateAddressInput;
}>;

export type SetShippingAddressMutation = {
  setOrderShippingAddress:
    | { __typename: 'NoActiveOrderError'; errorCode: ErrorCode; message: string }
    | {
        __typename: 'Order';
        id: string;
        code: string;
        state: string;
        active: boolean;
        currencyCode: CurrencyCode;
        totalQuantity: number;
        subTotalWithTax: number;
        shippingWithTax: number;
        totalWithTax: number;
        couponCodes: Array<string>;
        discounts: Array<{ description: string; amountWithTax: number }>;
        customer: { emailAddress: string; firstName: string; lastName: string } | null;
        shippingAddress: {
          fullName: string | null;
          company: string | null;
          streetLine1: string | null;
          streetLine2: string | null;
          city: string | null;
          province: string | null;
          postalCode: string | null;
          countryCode: string | null;
          phoneNumber: string | null;
        } | null;
        shippingLines: Array<{
          priceWithTax: number;
          shippingMethod: { id: string; code: string; name: string };
        }>;
        lines: Array<{
          id: string;
          quantity: number;
          unitPriceWithTax: number;
          linePriceWithTax: number;
          discountedLinePriceWithTax: number;
          productVariant: {
            id: string;
            name: string;
            sku: string;
            currencyCode: CurrencyCode;
            product: { slug: string };
          };
          featuredAsset: { preview: string } | null;
        }>;
        payments: Array<{
          id: string;
          state: string;
          transactionId: string | null;
          amount: number;
        }> | null;
      };
};

export type SetBillingAddressMutationVariables = Exact<{
  input: CreateAddressInput;
}>;

export type SetBillingAddressMutation = {
  setOrderBillingAddress:
    | { __typename: 'NoActiveOrderError'; errorCode: ErrorCode; message: string }
    | {
        __typename: 'Order';
        id: string;
        code: string;
        state: string;
        active: boolean;
        currencyCode: CurrencyCode;
        totalQuantity: number;
        subTotalWithTax: number;
        shippingWithTax: number;
        totalWithTax: number;
        couponCodes: Array<string>;
        discounts: Array<{ description: string; amountWithTax: number }>;
        customer: { emailAddress: string; firstName: string; lastName: string } | null;
        shippingAddress: {
          fullName: string | null;
          company: string | null;
          streetLine1: string | null;
          streetLine2: string | null;
          city: string | null;
          province: string | null;
          postalCode: string | null;
          countryCode: string | null;
          phoneNumber: string | null;
        } | null;
        shippingLines: Array<{
          priceWithTax: number;
          shippingMethod: { id: string; code: string; name: string };
        }>;
        lines: Array<{
          id: string;
          quantity: number;
          unitPriceWithTax: number;
          linePriceWithTax: number;
          discountedLinePriceWithTax: number;
          productVariant: {
            id: string;
            name: string;
            sku: string;
            currencyCode: CurrencyCode;
            product: { slug: string };
          };
          featuredAsset: { preview: string } | null;
        }>;
        payments: Array<{
          id: string;
          state: string;
          transactionId: string | null;
          amount: number;
        }> | null;
      };
};

export type EligibleShippingMethodsQueryVariables = Exact<{ [key: string]: never }>;

export type EligibleShippingMethodsQuery = {
  eligibleShippingMethods: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    price: number;
    priceWithTax: number;
  }>;
};

export type SetShippingMethodMutationVariables = Exact<{
  ids: Array<string | number> | string | number;
}>;

export type SetShippingMethodMutation = {
  setOrderShippingMethod:
    | { __typename: 'IneligibleShippingMethodError'; errorCode: ErrorCode; message: string }
    | { __typename: 'NoActiveOrderError'; errorCode: ErrorCode; message: string }
    | {
        __typename: 'Order';
        id: string;
        code: string;
        state: string;
        active: boolean;
        currencyCode: CurrencyCode;
        totalQuantity: number;
        subTotalWithTax: number;
        shippingWithTax: number;
        totalWithTax: number;
        couponCodes: Array<string>;
        discounts: Array<{ description: string; amountWithTax: number }>;
        customer: { emailAddress: string; firstName: string; lastName: string } | null;
        shippingAddress: {
          fullName: string | null;
          company: string | null;
          streetLine1: string | null;
          streetLine2: string | null;
          city: string | null;
          province: string | null;
          postalCode: string | null;
          countryCode: string | null;
          phoneNumber: string | null;
        } | null;
        shippingLines: Array<{
          priceWithTax: number;
          shippingMethod: { id: string; code: string; name: string };
        }>;
        lines: Array<{
          id: string;
          quantity: number;
          unitPriceWithTax: number;
          linePriceWithTax: number;
          discountedLinePriceWithTax: number;
          productVariant: {
            id: string;
            name: string;
            sku: string;
            currencyCode: CurrencyCode;
            product: { slug: string };
          };
          featuredAsset: { preview: string } | null;
        }>;
        payments: Array<{
          id: string;
          state: string;
          transactionId: string | null;
          amount: number;
        }> | null;
      }
    | { __typename: 'OrderModificationError'; errorCode: ErrorCode; message: string };
};

export type TransitionOrderMutationVariables = Exact<{
  state: string;
}>;

export type TransitionOrderMutation = {
  transitionOrderToState:
    | {
        __typename: 'Order';
        id: string;
        code: string;
        state: string;
        active: boolean;
        currencyCode: CurrencyCode;
        totalQuantity: number;
        subTotalWithTax: number;
        shippingWithTax: number;
        totalWithTax: number;
        couponCodes: Array<string>;
        discounts: Array<{ description: string; amountWithTax: number }>;
        customer: { emailAddress: string; firstName: string; lastName: string } | null;
        shippingAddress: {
          fullName: string | null;
          company: string | null;
          streetLine1: string | null;
          streetLine2: string | null;
          city: string | null;
          province: string | null;
          postalCode: string | null;
          countryCode: string | null;
          phoneNumber: string | null;
        } | null;
        shippingLines: Array<{
          priceWithTax: number;
          shippingMethod: { id: string; code: string; name: string };
        }>;
        lines: Array<{
          id: string;
          quantity: number;
          unitPriceWithTax: number;
          linePriceWithTax: number;
          discountedLinePriceWithTax: number;
          productVariant: {
            id: string;
            name: string;
            sku: string;
            currencyCode: CurrencyCode;
            product: { slug: string };
          };
          featuredAsset: { preview: string } | null;
        }>;
        payments: Array<{
          id: string;
          state: string;
          transactionId: string | null;
          amount: number;
        }> | null;
      }
    | {
        __typename: 'OrderStateTransitionError';
        errorCode: ErrorCode;
        message: string;
        transitionError: string;
        fromState: string;
        toState: string;
      }
    | null;
};

export type CreateMercadoPagoCheckoutMutationVariables = Exact<{
  input: MercadoPagoCheckoutInput;
}>;

export type CreateMercadoPagoCheckoutMutation = {
  createMercadoPagoCheckout:
    | {
        __typename: 'MercadoPagoCheckout';
        preferenceId: string;
        initPoint: string;
        sandboxInitPoint: string | null;
        expiresAt: string;
      }
    | { __typename: 'MercadoPagoError'; errorCode: ErrorCode; message: string; reason: string };
};

export type SyncMercadoPagoPaymentMutationVariables = Exact<{
  orderCode: string;
  paymentId: string;
}>;

export type SyncMercadoPagoPaymentMutation = {
  syncMercadoPagoPayment:
    | { __typename: 'MercadoPagoError'; errorCode: ErrorCode; message: string; reason: string }
    | {
        __typename: 'MercadoPagoPaymentSync';
        outcome: string;
        orderCode: string;
        orderState: string;
      };
};

export type OrderByCodeQueryVariables = Exact<{
  code: string;
}>;

export type OrderByCodeQuery = {
  orderByCode: {
    id: string;
    code: string;
    state: string;
    active: boolean;
    currencyCode: CurrencyCode;
    totalQuantity: number;
    subTotalWithTax: number;
    shippingWithTax: number;
    totalWithTax: number;
    couponCodes: Array<string>;
    discounts: Array<{ description: string; amountWithTax: number }>;
    customer: { emailAddress: string; firstName: string; lastName: string } | null;
    shippingAddress: {
      fullName: string | null;
      company: string | null;
      streetLine1: string | null;
      streetLine2: string | null;
      city: string | null;
      province: string | null;
      postalCode: string | null;
      countryCode: string | null;
      phoneNumber: string | null;
    } | null;
    shippingLines: Array<{
      priceWithTax: number;
      shippingMethod: { id: string; code: string; name: string };
    }>;
    lines: Array<{
      id: string;
      quantity: number;
      unitPriceWithTax: number;
      linePriceWithTax: number;
      discountedLinePriceWithTax: number;
      productVariant: {
        id: string;
        name: string;
        sku: string;
        currencyCode: CurrencyCode;
        product: { slug: string };
      };
      featuredAsset: { preview: string } | null;
    }>;
    payments: Array<{
      id: string;
      state: string;
      transactionId: string | null;
      amount: number;
    }> | null;
  } | null;
};

export type EligiblePaymentMethodsQueryVariables = Exact<{ [key: string]: never }>;

export type EligiblePaymentMethodsQuery = {
  eligiblePaymentMethods: Array<{ code: string; name: string; isEligible: boolean }>;
};

export type CartFragment = {
  id: string;
  code: string;
  state: string;
  active: boolean;
  currencyCode: CurrencyCode;
  totalQuantity: number;
  subTotalWithTax: number;
  shippingWithTax: number;
  totalWithTax: number;
  couponCodes: Array<string>;
  discounts: Array<{ description: string; amountWithTax: number }>;
  customer: { emailAddress: string; firstName: string; lastName: string } | null;
  shippingAddress: {
    fullName: string | null;
    company: string | null;
    streetLine1: string | null;
    streetLine2: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    countryCode: string | null;
    phoneNumber: string | null;
  } | null;
  shippingLines: Array<{
    priceWithTax: number;
    shippingMethod: { id: string; code: string; name: string };
  }>;
  lines: Array<{
    id: string;
    quantity: number;
    unitPriceWithTax: number;
    linePriceWithTax: number;
    discountedLinePriceWithTax: number;
    productVariant: {
      id: string;
      name: string;
      sku: string;
      currencyCode: CurrencyCode;
      product: { slug: string };
    };
    featuredAsset: { preview: string } | null;
  }>;
  payments: Array<{
    id: string;
    state: string;
    transactionId: string | null;
    amount: number;
  }> | null;
};

export type ProductSummaryFragment = {
  id: string;
  name: string;
  slug: string;
  description: string;
  featuredAsset: { preview: string } | null;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    priceWithTax: number;
    currencyCode: CurrencyCode;
    stockLevel: string;
  }>;
};

export const CartFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Cart' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'code' } },
          { kind: 'Field', name: { kind: 'Name', value: 'state' } },
          { kind: 'Field', name: { kind: 'Name', value: 'active' } },
          { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalQuantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subTotalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'shippingWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'couponCodes' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'discounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amountWithTax' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingAddress' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countryCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingLines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingMethod' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'lines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unitPriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'discountedLinePriceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'productVariant' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'product' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'slug' } }],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'payments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CartFragment, unknown>;
export const ProductSummaryFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'ProductSummary' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Product' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'featuredAsset' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'variants' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'stockLevel' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ProductSummaryFragment, unknown>;
export const RegisterDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'Register' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'RegisterCustomerInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'registerCustomerAccount' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Success' } },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'success' } }],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ErrorResult' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RegisterMutation, RegisterMutationVariables>;
export const LoginDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'Login' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'rememberMe' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'login' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'username' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'password' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'rememberMe' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'rememberMe' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'CurrentUser' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'identifier' } },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ErrorResult' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<LoginMutation, LoginMutationVariables>;
export const LogoutDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'Logout' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'logout' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'success' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<LogoutMutation, LogoutMutationVariables>;
export const ActiveCustomerDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ActiveCustomer' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'activeCustomer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ActiveCustomerQuery, ActiveCustomerQueryVariables>;
export const CustomerOrdersDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'CustomerOrders' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'OrderListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'activeCustomer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'orders' },
                  arguments: [
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'options' },
                      value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
                    },
                  ],
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'items' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'orderPlacedAt' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'totalQuantity' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CustomerOrdersQuery, CustomerOrdersQueryVariables>;
export const VerifyEmailDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'VerifyEmail' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'token' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verifyCustomerAccount' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'token' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'token' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'password' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'CurrentUser' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ErrorResult' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<VerifyEmailMutation, VerifyEmailMutationVariables>;
export const RequestPasswordResetDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RequestPasswordReset' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'requestPasswordReset' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'emailAddress' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Success' } },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'success' } }],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ErrorResult' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RequestPasswordResetMutation, RequestPasswordResetMutationVariables>;
export const ResetPasswordDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ResetPassword' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'token' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'resetPassword' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'token' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'token' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'password' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'CurrentUser' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ErrorResult' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ResetPasswordMutation, ResetPasswordMutationVariables>;
export const ActiveOrderDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ActiveOrder' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'activeOrder' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'FragmentSpread', name: { kind: 'Name', value: 'Cart' } }],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Cart' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'code' } },
          { kind: 'Field', name: { kind: 'Name', value: 'state' } },
          { kind: 'Field', name: { kind: 'Name', value: 'active' } },
          { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalQuantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subTotalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'shippingWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'couponCodes' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'discounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amountWithTax' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingAddress' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countryCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingLines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingMethod' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'lines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unitPriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'discountedLinePriceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'productVariant' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'product' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'slug' } }],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'payments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ActiveOrderQuery, ActiveOrderQueryVariables>;
export const AddItemDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AddItem' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'variantId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'quantity' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'addItemToOrder' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'productVariantId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'variantId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'quantity' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'quantity' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                { kind: 'FragmentSpread', name: { kind: 'Name', value: 'Cart' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ErrorResult' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Cart' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'code' } },
          { kind: 'Field', name: { kind: 'Name', value: 'state' } },
          { kind: 'Field', name: { kind: 'Name', value: 'active' } },
          { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalQuantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subTotalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'shippingWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'couponCodes' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'discounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amountWithTax' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingAddress' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countryCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingLines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingMethod' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'lines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unitPriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'discountedLinePriceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'productVariant' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'product' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'slug' } }],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'payments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AddItemMutation, AddItemMutationVariables>;
export const AdjustLineDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdjustLine' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'lineId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'quantity' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'adjustOrderLine' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderLineId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'lineId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'quantity' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'quantity' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                { kind: 'FragmentSpread', name: { kind: 'Name', value: 'Cart' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ErrorResult' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Cart' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'code' } },
          { kind: 'Field', name: { kind: 'Name', value: 'state' } },
          { kind: 'Field', name: { kind: 'Name', value: 'active' } },
          { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalQuantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subTotalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'shippingWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'couponCodes' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'discounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amountWithTax' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingAddress' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countryCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingLines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingMethod' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'lines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unitPriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'discountedLinePriceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'productVariant' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'product' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'slug' } }],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'payments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AdjustLineMutation, AdjustLineMutationVariables>;
export const RemoveLineDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RemoveLine' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'lineId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'removeOrderLine' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderLineId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'lineId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                { kind: 'FragmentSpread', name: { kind: 'Name', value: 'Cart' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ErrorResult' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Cart' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'code' } },
          { kind: 'Field', name: { kind: 'Name', value: 'state' } },
          { kind: 'Field', name: { kind: 'Name', value: 'active' } },
          { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalQuantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subTotalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'shippingWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'couponCodes' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'discounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amountWithTax' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingAddress' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countryCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingLines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingMethod' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'lines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unitPriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'discountedLinePriceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'productVariant' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'product' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'slug' } }],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'payments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RemoveLineMutation, RemoveLineMutationVariables>;
export const ApplyCouponDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ApplyCoupon' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'code' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'applyCouponCode' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'couponCode' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'code' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                { kind: 'FragmentSpread', name: { kind: 'Name', value: 'Cart' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ErrorResult' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Cart' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'code' } },
          { kind: 'Field', name: { kind: 'Name', value: 'state' } },
          { kind: 'Field', name: { kind: 'Name', value: 'active' } },
          { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalQuantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subTotalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'shippingWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'couponCodes' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'discounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amountWithTax' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingAddress' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countryCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingLines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingMethod' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'lines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unitPriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'discountedLinePriceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'productVariant' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'product' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'slug' } }],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'payments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ApplyCouponMutation, ApplyCouponMutationVariables>;
export const RemoveCouponDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RemoveCoupon' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'code' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'removeCouponCode' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'couponCode' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'code' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'FragmentSpread', name: { kind: 'Name', value: 'Cart' } }],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Cart' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'code' } },
          { kind: 'Field', name: { kind: 'Name', value: 'state' } },
          { kind: 'Field', name: { kind: 'Name', value: 'active' } },
          { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalQuantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subTotalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'shippingWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'couponCodes' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'discounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amountWithTax' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingAddress' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countryCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingLines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingMethod' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'lines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unitPriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'discountedLinePriceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'productVariant' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'product' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'slug' } }],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'payments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RemoveCouponMutation, RemoveCouponMutationVariables>;
export const ProductsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Products' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ProductListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'products' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'FragmentSpread', name: { kind: 'Name', value: 'ProductSummary' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'ProductSummary' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Product' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'featuredAsset' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'variants' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'stockLevel' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ProductsQuery, ProductsQueryVariables>;
export const ProductDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Product' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'slug' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'product' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'slug' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'slug' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'FragmentSpread', name: { kind: 'Name', value: 'ProductSummary' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'assets' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'collections' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'ProductSummary' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Product' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'featuredAsset' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'variants' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'stockLevel' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ProductQuery, ProductQueryVariables>;
export const SearchDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Search' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'SearchInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'search' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'productId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'productName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'productAsset' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'priceWithTax' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'InlineFragment',
                              typeCondition: {
                                kind: 'NamedType',
                                name: { kind: 'Name', value: 'SinglePrice' },
                              },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'value' } },
                                ],
                              },
                            },
                            {
                              kind: 'InlineFragment',
                              typeCondition: {
                                kind: 'NamedType',
                                name: { kind: 'Name', value: 'PriceRange' },
                              },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'min' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'max' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'facetValues' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'count' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'facetValue' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'facet' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SearchQuery, SearchQueryVariables>;
export const CollectionsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Collections' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'CollectionListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'collections' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'parentId' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'featuredAsset' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CollectionsQuery, CollectionsQueryVariables>;
export const CollectionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Collection' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'slug' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'collection' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'slug' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'slug' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'breadcrumbs' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CollectionQuery, CollectionQueryVariables>;
export const SetCustomerDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SetCustomer' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateCustomerInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'setCustomerForOrder' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                { kind: 'FragmentSpread', name: { kind: 'Name', value: 'Cart' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ErrorResult' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Cart' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'code' } },
          { kind: 'Field', name: { kind: 'Name', value: 'state' } },
          { kind: 'Field', name: { kind: 'Name', value: 'active' } },
          { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalQuantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subTotalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'shippingWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'couponCodes' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'discounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amountWithTax' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingAddress' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countryCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingLines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingMethod' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'lines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unitPriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'discountedLinePriceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'productVariant' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'product' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'slug' } }],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'payments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SetCustomerMutation, SetCustomerMutationVariables>;
export const SetShippingAddressDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SetShippingAddress' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateAddressInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'setOrderShippingAddress' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                { kind: 'FragmentSpread', name: { kind: 'Name', value: 'Cart' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ErrorResult' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Cart' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'code' } },
          { kind: 'Field', name: { kind: 'Name', value: 'state' } },
          { kind: 'Field', name: { kind: 'Name', value: 'active' } },
          { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalQuantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subTotalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'shippingWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'couponCodes' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'discounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amountWithTax' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingAddress' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countryCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingLines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingMethod' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'lines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unitPriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'discountedLinePriceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'productVariant' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'product' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'slug' } }],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'payments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SetShippingAddressMutation, SetShippingAddressMutationVariables>;
export const SetBillingAddressDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SetBillingAddress' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateAddressInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'setOrderBillingAddress' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                { kind: 'FragmentSpread', name: { kind: 'Name', value: 'Cart' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ErrorResult' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Cart' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'code' } },
          { kind: 'Field', name: { kind: 'Name', value: 'state' } },
          { kind: 'Field', name: { kind: 'Name', value: 'active' } },
          { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalQuantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subTotalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'shippingWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'couponCodes' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'discounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amountWithTax' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingAddress' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countryCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingLines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingMethod' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'lines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unitPriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'discountedLinePriceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'productVariant' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'product' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'slug' } }],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'payments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SetBillingAddressMutation, SetBillingAddressMutationVariables>;
export const EligibleShippingMethodsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'EligibleShippingMethods' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'eligibleShippingMethods' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<EligibleShippingMethodsQuery, EligibleShippingMethodsQueryVariables>;
export const SetShippingMethodDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SetShippingMethod' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'ids' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'setOrderShippingMethod' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'shippingMethodId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'ids' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                { kind: 'FragmentSpread', name: { kind: 'Name', value: 'Cart' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ErrorResult' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Cart' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'code' } },
          { kind: 'Field', name: { kind: 'Name', value: 'state' } },
          { kind: 'Field', name: { kind: 'Name', value: 'active' } },
          { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalQuantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subTotalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'shippingWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'couponCodes' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'discounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amountWithTax' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingAddress' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countryCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingLines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingMethod' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'lines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unitPriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'discountedLinePriceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'productVariant' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'product' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'slug' } }],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'payments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SetShippingMethodMutation, SetShippingMethodMutationVariables>;
export const TransitionOrderDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'TransitionOrder' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'state' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'transitionOrderToState' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'state' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'state' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                { kind: 'FragmentSpread', name: { kind: 'Name', value: 'Cart' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'OrderStateTransitionError' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'transitionError' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'fromState' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'toState' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Cart' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'code' } },
          { kind: 'Field', name: { kind: 'Name', value: 'state' } },
          { kind: 'Field', name: { kind: 'Name', value: 'active' } },
          { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalQuantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subTotalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'shippingWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'couponCodes' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'discounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amountWithTax' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingAddress' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countryCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingLines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingMethod' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'lines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unitPriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'discountedLinePriceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'productVariant' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'product' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'slug' } }],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'payments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<TransitionOrderMutation, TransitionOrderMutationVariables>;
export const CreateMercadoPagoCheckoutDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateMercadoPagoCheckout' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'MercadoPagoCheckoutInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createMercadoPagoCheckout' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'MercadoPagoCheckout' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'preferenceId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'initPoint' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sandboxInitPoint' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'expiresAt' } },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'MercadoPagoError' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'reason' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateMercadoPagoCheckoutMutation,
  CreateMercadoPagoCheckoutMutationVariables
>;
export const SyncMercadoPagoPaymentDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SyncMercadoPagoPayment' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'orderCode' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'paymentId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'syncMercadoPagoPayment' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderCode' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'orderCode' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'paymentId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'paymentId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'MercadoPagoPaymentSync' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'outcome' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'orderCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'orderState' } },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'MercadoPagoError' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'reason' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SyncMercadoPagoPaymentMutation,
  SyncMercadoPagoPaymentMutationVariables
>;
export const OrderByCodeDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'OrderByCode' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'code' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'orderByCode' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'code' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'code' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'FragmentSpread', name: { kind: 'Name', value: 'Cart' } }],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Cart' },
      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'code' } },
          { kind: 'Field', name: { kind: 'Name', value: 'state' } },
          { kind: 'Field', name: { kind: 'Name', value: 'active' } },
          { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalQuantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subTotalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'shippingWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
          { kind: 'Field', name: { kind: 'Name', value: 'couponCodes' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'discounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amountWithTax' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingAddress' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countryCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shippingLines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingMethod' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'lines' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unitPriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'discountedLinePriceWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'productVariant' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'product' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'slug' } }],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'payments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<OrderByCodeQuery, OrderByCodeQueryVariables>;
export const EligiblePaymentMethodsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'EligiblePaymentMethods' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'eligiblePaymentMethods' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isEligible' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<EligiblePaymentMethodsQuery, EligiblePaymentMethodsQueryVariables>;
