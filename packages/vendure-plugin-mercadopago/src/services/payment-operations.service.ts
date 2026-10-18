import { Injectable } from '@nestjs/common';
import { Order, RequestContext } from '@vendure/core';
import { toMercadoPagoAmount } from '../lib/amounts';
import { validatePaymentAgainstOrder } from '../lib/payment-validation';
import { MercadoPagoConnectionService, MercadoPagoNotConnectedError } from './connection.service';
import {
  MercadoPagoApiError,
  MercadoPagoApiService,
  MercadoPagoPayment,
} from './mercadopago-api.service';

export type VerifyResult =
  { ok: true; payment: MercadoPagoPayment } | { ok: false; message: string };

/** Calls the payment handler makes against Mercado Pago, always with the channel's own token. */
@Injectable()
export class MercadoPagoPaymentOperations {
  constructor(
    private readonly connections: MercadoPagoConnectionService,
    private readonly api: MercadoPagoApiService,
  ) {}

  /**
   * Independent proof that a payment is real, approved and covers the order. The handler runs it
   * on every `addPaymentToOrder`, so a buyer cannot settle an order through the public Shop API
   * by sending an arbitrary `mpPaymentId`: only a payment that Mercado Pago itself reports as
   * approved, for this order, in this store's account, is accepted.
   */
  async verifyApproved(
    ctx: RequestContext,
    order: Order,
    mpPaymentId: string,
    amount: number,
  ): Promise<VerifyResult> {
    let payment: MercadoPagoPayment;
    try {
      const { accessToken } = await this.connections.getAccessToken(ctx.channelId);
      payment = await this.api.getPayment(accessToken, mpPaymentId);
    } catch (error) {
      return { ok: false, message: this.describe(error, 'Could not verify the payment') };
    }
    if (payment.status !== 'approved') {
      return {
        ok: false,
        message: `The Mercado Pago payment is ${payment.status ?? 'unknown'}, not approved.`,
      };
    }
    const validation = validatePaymentAgainstOrder(payment, {
      code: order.code,
      totalWithTax: order.totalWithTax,
      currencyCode: order.currencyCode,
    });
    if (!validation.ok) {
      return {
        ok: false,
        message: `The Mercado Pago payment does not match the order (${validation.reason}).`,
      };
    }
    if (amount !== order.totalWithTax) {
      return { ok: false, message: 'Partial payments are not supported for Mercado Pago.' };
    }
    return { ok: true, payment };
  }

  /** Cancels a payment that is still `pending` or `in_process` (PRD 9.9). */
  async cancel(
    ctx: RequestContext,
    mpPaymentId: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const { accessToken } = await this.connections.getAccessToken(ctx.channelId);
      await this.api.cancelPayment(accessToken, mpPaymentId);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: this.describe(error, 'Mercado Pago could not cancel the payment'),
      };
    }
  }

  /**
   * Full refund when `amountMinorUnits` covers the whole payment (empty body), partial otherwise
   * (PRD 9.9). A refund the seller's balance cannot cover comes back as a readable message.
   */
  async refund(
    ctx: RequestContext,
    mpPaymentId: string,
    amountMinorUnits: number,
    paymentAmountMinorUnits: number,
    idempotencyKey: string,
  ): Promise<{ ok: true; refundId: string } | { ok: false; message: string }> {
    try {
      const { accessToken } = await this.connections.getAccessToken(ctx.channelId);
      const full = amountMinorUnits === paymentAmountMinorUnits;
      const { id } = await this.api.refundPayment(
        accessToken,
        mpPaymentId,
        full ? undefined : toMercadoPagoAmount(amountMinorUnits),
        idempotencyKey,
      );
      return { ok: true, refundId: id };
    } catch (error) {
      return { ok: false, message: this.describe(error, 'Mercado Pago rejected the refund') };
    }
  }

  private describe(error: unknown, prefix: string): string {
    if (error instanceof MercadoPagoNotConnectedError) return error.message;
    if (error instanceof MercadoPagoApiError) return `${prefix}: ${error.message}`;
    return `${prefix}.`;
  }
}
