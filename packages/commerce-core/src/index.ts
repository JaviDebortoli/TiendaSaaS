import { createAccount } from './account';
import { createCart } from './cart';
import { createCatalog } from './catalog';
import { Transport, CommerceConfig } from './client';
import { createCheckout } from './checkout';
import { createPayment } from './payment';

/**
 * One entry point per store: `createCommerce({ apiUrl, channelToken, session })`.
 * No visual components, no framework, no secrets, no Mercado Pago SDK: the payment itself happens
 * on the server and on the Mercado Pago page.
 */
export function createCommerce(config: CommerceConfig) {
  const transport = new Transport(config);
  return {
    catalog: createCatalog(transport),
    cart: createCart(transport),
    checkout: createCheckout(transport),
    payment: createPayment(transport),
    account: createAccount(transport),
  };
}

export type Commerce = ReturnType<typeof createCommerce>;

export { CommerceError, ErrorCodes } from './errors';
export { formatMoney } from './money';
export { isPaidState } from './payment';
export { memorySession } from './session';
export type { SessionStore } from './session';
export type { CommerceConfig } from './client';
export type { SearchOptions } from './catalog';
export type { ReturnUrls, StartedPayment } from './checkout';
export type { PaymentResult, PaymentState, WaitForPaymentOptions } from './payment';
export type { Registration } from './account';
export type * from './types';
