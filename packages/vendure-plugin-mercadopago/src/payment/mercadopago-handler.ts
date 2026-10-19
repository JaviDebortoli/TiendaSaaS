import {
  LanguageCode,
  PaymentMethodEligibilityChecker,
  PaymentMethodHandler,
  UserInputError,
} from '@vendure/core';
import { createHash } from 'node:crypto';
import { MERCADOPAGO_HANDLER_CODE } from '../constants';
import { validatePaymentAgainstOrder } from '../lib/payment-validation';
import { MercadoPagoConnectionService } from '../services/connection.service';
import { MercadoPagoPaymentOperations } from '../services/payment-operations.service';
import { isSettling, verifiedSettlement } from '../settlement-scope';

let operations: MercadoPagoPaymentOperations;
let connections: MercadoPagoConnectionService;

/** `user_id` of the account that collected a payment, as stamped when it settled. */
function accountOf(payment: { metadata: unknown }): string | undefined {
  const value = (payment.metadata as { mpAccountUserId?: unknown } | undefined)?.mpAccountUserId;
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Hosted payment page pattern (PRD 9.5): the buyer pays on Mercado Pago, so by the time Vendure
 * hears about it the money is already captured. `createPayment` only accepts the call of the
 * plugin's own payment processor (webhook or sync mutation), which verified the payment against
 * Mercado Pago and opened the settlement scope for that exact order and payment. Anything else,
 * the public `addPaymentToOrder` included, is refused before Mercado Pago is asked anything.
 */
export const mercadoPagoHandler = new PaymentMethodHandler({
  code: MERCADOPAGO_HANDLER_CODE,
  description: [{ languageCode: LanguageCode.en, value: 'Mercado Pago (Checkout Pro)' }],
  args: {},

  init(injector) {
    operations = injector.get(MercadoPagoPaymentOperations);
  },

  async createPayment(_ctx, order, amount, _args, metadata) {
    const mpPaymentId = String(metadata?.mpPaymentId ?? '').trim();
    const settlement = verifiedSettlement(order.id, mpPaymentId);
    if (!settlement) {
      // An error, not a Declined payment: nothing is left on the order, and Mercado Pago is not
      // asked, so repeating the call costs the server nothing.
      throw new UserInputError(
        'Mercado Pago payments are added by the payment processor of the store, not through the Shop API.',
      );
    }
    const { payment, account } = settlement;
    if (amount !== order.totalWithTax) {
      return {
        amount,
        state: 'Error',
        errorMessage: 'Partial payments are not supported for Mercado Pago.',
        transactionId: mpPaymentId,
      };
    }
    // The processor checked this already; the order may have changed since, and it costs nothing.
    const validation = validatePaymentAgainstOrder(payment, {
      externalReference: settlement.externalReference,
      totalWithTax: order.totalWithTax,
      currencyCode: order.currencyCode,
    });
    if (!validation.ok) {
      return {
        amount,
        state: 'Error',
        errorMessage: `The Mercado Pago payment does not match the order (${validation.reason}).`,
        transactionId: mpPaymentId,
      };
    }
    return {
      amount,
      state: 'Settled',
      transactionId: mpPaymentId,
      metadata: {
        public: { mpPaymentId },
        mpStatus: payment.status,
        mpStatusDetail: payment.status_detail,
        // The account whose token read the payment: the one that refunds and cancels it later.
        mpAccountUserId: account.mpUserId,
        // Mercado Pago's own word for who collected it, kept as evidence.
        mpCollectorId: payment.collector_id,
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
