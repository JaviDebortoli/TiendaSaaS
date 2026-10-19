import { LanguageCode, PaymentMethodEligibilityChecker, PaymentMethodHandler } from '@vendure/core';
import { createHash } from 'node:crypto';
import { MERCADOPAGO_HANDLER_CODE } from '../constants';
import { MercadoPagoConnectionService } from '../services/connection.service';
import { MercadoPagoPaymentOperations } from '../services/payment-operations.service';
import { isSettling } from '../settlement-scope';

let operations: MercadoPagoPaymentOperations;
let connections: MercadoPagoConnectionService;

/** `user_id` of the account that collected a payment, as stamped when it settled. */
function accountOf(payment: { metadata: unknown }): string | undefined {
  const value = (payment.metadata as { mpAccountUserId?: unknown } | undefined)?.mpAccountUserId;
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Hosted payment page pattern (PRD 9.5): the buyer pays on Mercado Pago, so by the time Vendure
 * hears about it the money is already captured. `createPayment` is reached from the webhook (or
 * the sync mutation), never trusted from the storefront: it re-verifies the payment itself.
 */
export const mercadoPagoHandler = new PaymentMethodHandler({
  code: MERCADOPAGO_HANDLER_CODE,
  description: [{ languageCode: LanguageCode.en, value: 'Mercado Pago (Checkout Pro)' }],
  args: {},

  init(injector) {
    operations = injector.get(MercadoPagoPaymentOperations);
  },

  async createPayment(ctx, order, amount, _args, metadata) {
    const mpPaymentId = String(metadata?.mpPaymentId ?? '').trim();
    if (!mpPaymentId) {
      return { amount, state: 'Error', errorMessage: 'A Mercado Pago payment id is required.' };
    }
    const verification = await operations.verifyApproved(ctx, order, mpPaymentId, amount);
    if (!verification.ok) {
      return {
        amount,
        state: 'Error',
        errorMessage: verification.message,
        transactionId: mpPaymentId,
      };
    }
    return {
      amount,
      state: 'Settled',
      transactionId: mpPaymentId,
      metadata: {
        public: { mpPaymentId },
        mpStatus: verification.payment.status,
        mpStatusDetail: verification.payment.status_detail,
        // The account whose token read the payment: the one that refunds and cancels it later.
        mpAccountUserId: verification.account.mpUserId,
        // Mercado Pago's own word for who collected it, kept as evidence.
        mpCollectorId: verification.payment.collector_id,
      },
    };
  },

  // The payment arrives already captured, so there is nothing to settle (PRD 9.5).
  settlePayment() {
    return { success: true };
  },

  async cancelPayment(ctx, _order, payment) {
    const result = await operations.cancel(ctx, payment.transactionId, accountOf(payment));
    return result.ok
      ? { success: true }
      : {
          success: false,
          errorMessage: result.message,
          metadata: { errorMessage: result.message },
        };
  },

  async createRefund(ctx, input, amount, _order, payment) {
    // Same payment and amount within the same minute share a key, so a retry never refunds twice.
    const idempotencyKey = createHash('sha256')
      .update(
        `${payment.transactionId}:${amount}:${input.reason ?? ''}:${Math.floor(Date.now() / 60_000)}`,
      )
      .digest('hex');
    const result = await operations.refund(
      ctx,
      payment.transactionId,
      accountOf(payment),
      amount,
      payment.amount,
      idempotencyKey,
    );
    return result.ok
      ? { state: 'Settled', transactionId: result.refundId }
      : { state: 'Failed', metadata: { errorMessage: result.message } };
  },
});

/**
 * A channel can only offer Mercado Pago while it sells with an account whose token has not
 * expired (PRD 9.4): an `active` link to an account that is not revoked.
 */
export const mercadoPagoConnectedChecker = new PaymentMethodEligibilityChecker({
  code: 'mercado-pago-connected',
  description: [
    { languageCode: LanguageCode.en, value: 'The channel has a usable Mercado Pago connection' },
  ],
  args: {},
  init(injector) {
    connections = injector.get(MercadoPagoConnectionService);
  },
  async check(ctx, order) {
    // A payment Mercado Pago already approved is applied to its order even if the store has
    // unlinked or changed account since (settlement-scope.ts).
    if (isSettling(order.id)) return true;
    return connections.isChannelUsable(ctx.channelId);
  },
});
