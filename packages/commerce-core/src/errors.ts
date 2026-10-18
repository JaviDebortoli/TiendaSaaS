/**
 * Every failure of this package is a `CommerceError`, so a storefront has one thing to catch.
 *
 * `code` is stable and meant for logic ("INSUFFICIENT_STOCK_ERROR", "NOT_CONNECTED"); `message` is
 * meant for logs and, when the server wrote it for the buyer, for the screen.
 */
export class CommerceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'CommerceError';
  }
}

/** Codes this package raises itself, besides the `errorCode` values the Shop API returns. */
export const ErrorCodes = {
  /** The request reached the server but the GraphQL layer refused it. */
  GraphQL: 'GRAPHQL_ERROR',
  /** The server could not be reached. */
  Network: 'NETWORK_ERROR',
  /** The answer did not have the expected shape. */
  UnexpectedResponse: 'UNEXPECTED_RESPONSE',
  /** There is no active order (empty cart). */
  NoActiveOrder: 'NO_ACTIVE_ORDER',
} as const;

interface ErrorResultLike {
  __typename?: string;
  errorCode?: string;
  message?: string;
  reason?: string;
  [key: string]: unknown;
}

/**
 * Shop API mutations answer with a union of the result and `ErrorResult`s. This returns the
 * result, or throws the error as a `CommerceError` (for the custom Mercado Pago error, `code` is
 * its `reason`, for example "NOT_CONNECTED").
 */
export function unwrap<T extends { __typename?: string }>(result: T | null | undefined): T {
  if (!result) {
    throw new CommerceError(ErrorCodes.UnexpectedResponse, 'The server returned an empty result.');
  }
  const error = result as ErrorResultLike;
  if (typeof error.errorCode === 'string') {
    const { __typename, errorCode, message, reason, ...details } = error;
    throw new CommerceError(
      __typename === 'MercadoPagoError' && reason ? reason : errorCode,
      message ?? errorCode,
      { typename: __typename, errorCode, reason, ...details },
    );
  }
  return result;
}
