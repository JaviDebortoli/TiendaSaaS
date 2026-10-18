import { LanguageCode, PaymentMethodEligibilityChecker, PaymentMethodHandler } from '@vendure/core';
import { createHash } from 'node:crypto';
import { MERCADOPAGO_HANDLER_CODE } from '../constants';
import { MercadoPagoConnectionService } from '../services/connection.service';
import { MercadoPagoPaymentOperations } from '../services/payment-operations.service';

let operations: MercadoPagoPaymentOperations;
let connections: MercadoPagoConnectionService;

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
      },
    };
  },

  // The payment arrives already captured, so there is nothing to settle (PRD 9.5).
  settlePayment() {
    return { success: true };
  },

  async cancelPayment(ctx, _order, payment) {
    const result = await operations.cancel(ctx, payment.transactionId);
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
 * A channel can only offer Mercado Pago while its account is linked and its token has not
 * expired (PRD 9.4).
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
  async check(ctx) {
    return connections.isUsable(await connections.findByChannelId(ctx.channelId));
  },
});
