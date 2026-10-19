import type { Transport } from './client';
import { CommerceError } from './errors';
import { OrderByCodeQuery, SyncMercadoPagoPaymentMutation } from './operations/checkout';
import type { Cart } from './types';

/**
 * What the result screen should say.
 *
 * - `paid`: the server confirmed the payment (the order is settled).
 * - `pending`: Mercado Pago says the buyer still has to pay (Rapipago, Pago Fácil).
 * - `failed`: the payment was rejected or cancelled; the buyer can try again.
 * - `review`: money was taken but the store has to look at it before confirming.
 * - `processing`: nothing is confirmed yet; keep showing "procesando" and ask again later.
 */
export type PaymentState = 'paid' | 'pending' | 'failed' | 'review' | 'processing';

export interface PaymentResult {
  state: PaymentState;
  /**
   * The order the answer is about: the one given, or the one the server resolved when it checked the
   * payment. Undefined while nothing identifies an order.
   */
  orderCode?: string;
  order: Cart | null;
}

export interface WaitForPaymentOptions {
  /**
   * The order of this session, to read its state. Without it nothing is read until the server
   * says which order the payment is for. Never derive it from `externalReference`.
   */
  orderCode?: string;
  /**
   * The `external_reference` of the redirect, exactly as it arrived. It is only a pointer for the
   * fallback below, looked up whole by the server: it is never parsed, split or read here, and it
   * never confirms anything by itself.
   */
  externalReference?: string;
  /**
   * The `payment_id` of the redirect. It is only a pointer for the fallback below: it never
   * confirms anything by itself.
   */
  paymentId?: string;
  /** Give up after this long and answer `processing`. Default 30 s. */
  timeoutMs?: number;
  /** Time between checks. Default 1 s. */
  intervalMs?: number;
  /**
   * If the order is still unpaid after this long, ask the server to check the payment. It needs
   * both `externalReference` and `paymentId`. Default 10 s (PRD 9.6).
   */
  syncAfterMs?: number;
  signal?: AbortSignal;
  /** Injected in tests. */
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Order states that mean the payment was confirmed by the server. */
const PAID_STATES = new Set([
  'PaymentAuthorized',
  'PaymentSettled',
  'PartiallyShipped',
  'Shipped',
  'PartiallyDelivered',
  'Delivered',
]);

export const isPaidState = (state: string | undefined | null): boolean =>
  !!state && PAID_STATES.has(state);

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('Aborted'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error('Aborted'));
      },
      { once: true },
    );
  });

/** Maps the verdict the server reached after checking the payment itself. */
function stateFromSync(outcome: string): PaymentState | undefined {
  switch (outcome) {
    case 'settled':
    case 'already_settled':
      return 'paid';
    case 'pending':
      return 'pending';
    case 'rejected':
    case 'cancelled':
      return 'failed';
    case 'needs_review':
      return 'review';
    case 'reversed':
      return 'failed';
    default:
      return undefined;
  }
}

/**
 * The payment result flow (PRD 9.6 steps 4-6).
 *
 * **The parameters Mercado Pago puts in the redirect are never used to decide anything.** The
 * order is read from the server until it is settled. If the webhook is late, after `syncAfterMs`
 * the server is asked to check the payment itself with the credentials of the account that issued
 * the preference, and its answer is what counts, including which order the payment is for.
 */
export function createPayment(transport: Transport) {
  return {
    async waitForPayment(options: WaitForPaymentOptions): Promise<PaymentResult> {
      const {
        externalReference,
        paymentId,
        timeoutMs = 30_000,
        intervalMs = 1_000,
        syncAfterMs = 10_000,
        signal,
        now = Date.now,
        sleep = defaultSleep,
      } = options;
      let orderCode = options.orderCode;
      const started = now();
      let synced = false;
      let order: Cart | null;

      for (;;) {
        order = orderCode ? await readOrder(transport, orderCode) : null;
        if (isPaidState(order?.state)) return { state: 'paid', orderCode, order };

        const elapsed = now() - started;
        if (paymentId && externalReference && !synced && elapsed >= syncAfterMs) {
          synced = true;
          const verdict = await syncPayment(transport, externalReference, paymentId);
          // The server resolved the order from the preference it issued: that is the order to read.
          orderCode ??= verdict.orderCode;
          if (verdict.state) {
            if (orderCode) order = await readOrder(transport, orderCode);
            if (verdict.state === 'paid') {
              return { state: isPaidState(order?.state) ? 'paid' : 'processing', orderCode, order };
            }
            return { state: verdict.state, orderCode, order };
          }
        }

        if (elapsed >= timeoutMs) return { state: 'processing', orderCode, order };
        await sleep(intervalMs, signal);
      }
    },

    /**
     * Asks the server to check one payment now, by the reference of its preference. Returns the
     * verdict, if the server gave one. Mostly for custom flows; `waitForPayment` calls it when
     * needed.
     */
    async syncPayment(
      externalReference: string,
      paymentId: string,
    ): Promise<PaymentState | undefined> {
      return (await syncPayment(transport, externalReference, paymentId)).state;
    },
  };
}

/**
 * The order, or `null` when this session cannot see it (unknown code, or somebody else's order):
 * from the buyer's point of view that simply means "not confirmed".
 */
async function readOrder(transport: Transport, orderCode: string): Promise<Cart | null> {
  try {
    const { orderByCode } = await transport.request(OrderByCodeQuery, { code: orderCode });
    return orderByCode ?? null;
  } catch (error) {
    const extensions = (error as CommerceError).details?.extensions as
      { code?: string } | undefined;
    if (error instanceof CommerceError && extensions?.code === 'FORBIDDEN') return null;
    throw error;
  }
}

/**
 * The server's verdict on the payment, and the order it resolved from the preference. Both are
 * undefined when it could not give one (try again later) or did not know the reference.
 */
async function syncPayment(
  transport: Transport,
  externalReference: string,
  paymentId: string,
): Promise<{ state: PaymentState | undefined; orderCode: string | undefined }> {
  try {
    const { syncMercadoPagoPayment } = await transport.request(SyncMercadoPagoPaymentMutation, {
      externalReference,
      paymentId,
    });
    if (syncMercadoPagoPayment.__typename === 'MercadoPagoPaymentSync') {
      return {
        state: stateFromSync(syncMercadoPagoPayment.outcome),
        orderCode: syncMercadoPagoPayment.orderCode || undefined,
      };
    }
    return { state: undefined, orderCode: undefined };
  } catch (error) {
    if (error instanceof CommerceError) return { state: undefined, orderCode: undefined };
    throw error;
  }
}

export type PaymentApi = ReturnType<typeof createPayment>;
