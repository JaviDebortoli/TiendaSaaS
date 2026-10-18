/**
 * Where the buyer's Shop API session token lives between calls.
 *
 * The Shop API answers the first request with a `vendure-auth-token` header and expects it back as
 * `Authorization: Bearer <token>`. In a server-rendered storefront the right place is an
 * httpOnly cookie of the storefront (see the reference storefront); in a test, memory.
 *
 * The token is the buyer's cart and login. It is not a Mercado Pago secret and nothing else in
 * this package is secret: the channel token is public by design.
 */
export interface SessionStore {
  get(): string | undefined | Promise<string | undefined>;
  set(token: string | undefined): void | Promise<void>;
}

export function memorySession(initial?: string): SessionStore {
  let token = initial;
  return {
    get: () => token,
    set: (value) => {
      token = value;
    },
  };
}
