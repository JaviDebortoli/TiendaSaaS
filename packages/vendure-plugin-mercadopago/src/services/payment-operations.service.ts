import { Injectable } from '@nestjs/common';
import { Order, RequestContext } from '@vendure/core';
import { MercadoPagoAccount } from '../entities/mercadopago-account.entity';
import { toMercadoPagoAmount } from '../lib/amounts';
import { CollectorCheck, checkCollector } from '../lib/collector';
import { validatePaymentAgainstOrder } from '../lib/payment-validation';
import { MercadoPagoConnectionService, MercadoPagoNotConnectedError } from './connection.service';
import {
  MercadoPagoApiError,
  MercadoPagoApiService,
  MercadoPagoPayment,
} from './mercadopago-api.service';
import { MercadoPagoReviewService } from './review.service';

/** A payment read with the token of `account`, and whether Mercado Pago names that account as collector. */
export interface FoundPayment {
  payment: MercadoPagoPayment;
  account: MercadoPagoAccount;
  collector: CollectorCheck;
}

export type VerifyResult =
  | { ok: true; payment: MercadoPagoPayment; account: MercadoPagoAccount }
  | { ok: false; message: string };

type AccountResult = { ok: true; account: MercadoPagoAccount } | { ok: false; message: string };

/** What a store owner reads when the account a payment was collected with can no longer act on it. */
export function accountNotLinkedMessage(mpUserId: string): string {
  return `Este pago se cobró en la cuenta ${mpUserId}, que ya no está vinculada. Hacé el reembolso desde el panel de Mercado Pago de esa cuenta.`;
}

/**
 * Calls the payment handler makes against Mercado Pago. Each payment is read, refunded or
 * cancelled with the token of the account that collected it, which is not always the account the
 * store sells with today.
 */
@Injectable()
export class MercadoPagoPaymentOperations {
  constructor(
    private readonly connections: MercadoPagoConnectionService,
    private readonly api: MercadoPagoApiService,
    private readonly reviews: MercadoPagoReviewService,
  ) {}

  /**
   * Reads a payment with each candidate account in turn and returns the first one whose token
   * sees it and that Mercado Pago names as the collector. If none does, the first payment seen is
   * returned with its collector problem, so the caller can refuse it and say why. Returns null
   * when no candidate sees the payment.
   */
  async findPayment(
    candidates: MercadoPagoAccount[],
    mpPaymentId: string,
  ): Promise<FoundPayment | null> {
    let first: FoundPayment | undefined;
    let authError: MercadoPagoApiError | undefined;
    let tried = 0;
    for (const candidate of candidates) {
      if (!this.connections.hasTokens(candidate)) continue;
      let account: MercadoPagoAccount;
      let accessToken: string;
      try {
        ({ account, accessToken } = await this.connections.getAccountToken(candidate));
      } catch (error) {
        if (error instanceof MercadoPagoNotConnectedError) continue;
        throw error;
      }
      tried++;
      let payment: MercadoPagoPayment;
      try {
        payment = await this.api.getPayment(accessToken, mpPaymentId);
      } catch (error) {
        if (error instanceof MercadoPagoApiError && error.kind === 'not_found') continue;
        if (error instanceof MercadoPagoApiError && error.kind === 'auth') {
          authError ??= error;
          continue;
        }
        throw error;
      }
      const found = { payment, account, collector: checkCollector(payment, account.mpUserId) };
      if (found.collector.ok) return found;
      first ??= found;
    }
    if (first) return first;
    if (tried === 0) throw new MercadoPagoNotConnectedError();
    if (authError) throw authError;
    return null;
  }

  /**
   * Independent proof that a payment is real, approved and covers the order. The handler runs it
   * on every `addPaymentToOrder`, so a buyer cannot settle an order through the public Shop API
   * by sending an arbitrary `mpPaymentId`: only a payment that Mercado Pago itself reports as
   * approved, for this order, and collected by an account this store has used, is accepted.
   */
  async verifyApproved(
    ctx: RequestContext,
    order: Order,
    mpPaymentId: string,
    amount: number,
  ): Promise<VerifyResult> {
    let found: FoundPayment | null;
    try {
      const candidates = await this.connections.accountsForChannel(ctx.channelId, [
        'active',
        'retired',
        'released',
      ]);
      found = await this.findPayment(candidates, mpPaymentId);
    } catch (error) {
      return { ok: false, message: this.describe(error, 'Could not verify the payment') };
    }
    if (!found) {
      return { ok: false, message: 'Could not verify the payment: Payment not found' };
    }
    const { payment, account, collector } = found;
    if (payment.status !== 'approved') {
      return {
        ok: false,
        message: `The Mercado Pago payment is ${payment.status ?? 'unknown'}, not approved.`,
      };
    }
    if (!collector.ok) {
      await this.reviews.markNeedsReview(
        ctx,
        order,
        mpPaymentId,
        collector.reason,
        account.mpUserId,
        payment.collector_id,
      );
      return {
        ok: false,
        message:
          collector.reason === 'collector_missing'
            ? 'Mercado Pago did not say which account collected the payment.'
            : 'The payment was collected by a different Mercado Pago account.',
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
    return { ok: true, payment, account };
  }

  /** Cancels a payment that is still `pending` or `in_process` (PRD 9.9). */
  async cancel(
    ctx: RequestContext,
    mpPaymentId: string,
    mpAccountUserId: string | undefined,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const resolved = await this.accountForPayment(ctx, mpAccountUserId);
    if (!resolved.ok) return resolved;
    try {
      const { accessToken } = await this.connections.getAccountToken(resolved.account);
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
    mpAccountUserId: string | undefined,
    amountMinorUnits: number,
    paymentAmountMinorUnits: number,
    idempotencyKey: string,
  ): Promise<{ ok: true; refundId: string } | { ok: false; message: string }> {
    const resolved = await this.accountForPayment(ctx, mpAccountUserId);
    if (!resolved.ok) return resolved;
    try {
      const { accessToken } = await this.connections.getAccountToken(resolved.account);
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

  /**
   * The account that collected a payment, as long as it can still act on it: it holds tokens and
   * the store still has a live link with it. A payment without the stamp (taken before accounts
   * and links existed and not migrated) is assumed to belong to the store's active account.
   */
  async accountForPayment(
    ctx: RequestContext,
    mpAccountUserId: string | undefined,
  ): Promise<AccountResult> {
    if (!mpAccountUserId) {
      const active = await this.connections.findActiveAccount(ctx.channelId);
      return this.connections.hasTokens(active)
        ? { ok: true, account: active }
        : { ok: false, message: new MercadoPagoNotConnectedError().message };
    }
    const account = await this.connections.findAccountByMpUserId(mpAccountUserId);
    const link = account ? await this.connections.findLink(ctx.channelId, account.id) : null;
    if (!this.connections.hasTokens(account) || !link || link.status === 'released') {
      return { ok: false, message: accountNotLinkedMessage(mpAccountUserId) };
    }
    return { ok: true, account };
  }

  private describe(error: unknown, prefix: string): string {
    if (error instanceof MercadoPagoNotConnectedError) return error.message;
    if (error instanceof MercadoPagoApiError) return `${prefix}: ${error.message}`;
    return `${prefix}.`;
  }
}
