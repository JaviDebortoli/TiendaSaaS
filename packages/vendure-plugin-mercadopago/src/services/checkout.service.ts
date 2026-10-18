import { Inject, Injectable } from '@nestjs/common';
import {
  ActiveOrderService,
  Channel,
  Logger,
  Order,
  OrderService,
  RequestContext,
} from '@vendure/core';
import { createHash } from 'node:crypto';
import { loggerCtx, MP_PLUGIN_OPTIONS } from '../constants';
import { STOREFRONT_URL_FIELD } from '../custom-fields';
import { toMercadoPagoAmount } from '../lib/amounts';
import type { ResolvedMercadoPagoOptions } from '../types';
import { MercadoPagoNotConnectedError, MercadoPagoConnectionService } from './connection.service';
import { MercadoPagoApiError, MercadoPagoApiService } from './mercadopago-api.service';

export type CheckoutErrorReason =
  | 'ORDER_NOT_FOUND'
  | 'ORDER_NOT_READY'
  | 'EMPTY_ORDER'
  | 'UNSUPPORTED_CURRENCY'
  | 'NOT_CONNECTED'
  | 'STOREFRONT_NOT_CONFIGURED'
  | 'INVALID_BACK_URL'
  | 'MERCADOPAGO_UNAVAILABLE';

export class CheckoutError extends Error {
  constructor(
    readonly reason: CheckoutErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'CheckoutError';
  }
}

export interface BackUrls {
  successUrl: string;
  failureUrl: string;
  pendingUrl: string;
}

export interface CheckoutResult {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint: string | null;
  expiresAt: Date;
}

/** Idempotency keys and preference validity are aligned to windows of this size. */
const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;
const MAX_TITLE_LENGTH = 250;

const LOCAL_HOST = /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/i;

/** Creates the Checkout Pro preference with the store's own token (PRD 9.6 step 2). */
@Injectable()
export class MercadoPagoCheckoutService {
  constructor(
    private readonly activeOrderService: ActiveOrderService,
    private readonly orderService: OrderService,
    private readonly connections: MercadoPagoConnectionService,
    private readonly api: MercadoPagoApiService,
    @Inject(MP_PLUGIN_OPTIONS) private readonly options: ResolvedMercadoPagoOptions,
  ) {}

  async createCheckout(
    ctx: RequestContext,
    orderCode: string,
    urls: BackUrls,
  ): Promise<CheckoutResult> {
    // The preference is only created for the order in the buyer's own session.
    const active = await this.activeOrderService.getActiveOrder(ctx, undefined);
    const order =
      active && active.code === orderCode
        ? await this.orderService.findOne(ctx, active.id, [
            'lines',
            'lines.productVariant',
            'customer',
          ])
        : undefined;
    if (!order) {
      throw new CheckoutError(
        'ORDER_NOT_FOUND',
        'The order is not the active order of this session.',
      );
    }
    if (order.state !== 'ArrangingPayment') {
      throw new CheckoutError(
        'ORDER_NOT_READY',
        `The order must be in ArrangingPayment, but it is in ${order.state}.`,
      );
    }
    if (order.totalWithTax <= 0) {
      throw new CheckoutError('EMPTY_ORDER', 'The order total must be greater than zero.');
    }
    if (order.currencyCode !== 'ARS') {
      throw new CheckoutError(
        'UNSUPPORTED_CURRENCY',
        'Mercado Pago Argentina only charges in ARS.',
      );
    }
    this.assertBackUrls(ctx.channel, urls);

    let accessToken: string;
    try {
      ({ accessToken } = await this.connections.getAccessToken(ctx.channelId));
    } catch (error) {
      if (error instanceof MercadoPagoNotConnectedError) {
        throw new CheckoutError('NOT_CONNECTED', 'This store cannot take payments right now.');
      }
      throw error;
    }

    const windowStart = Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS) * IDEMPOTENCY_WINDOW_MS;
    const expiresAt = new Date(windowStart + this.options.preferenceTtlMinutes * 60_000);
    const body = {
      items: this.buildItems(order),
      payer: this.buildPayer(order),
      back_urls: { success: urls.successUrl, failure: urls.failureUrl, pending: urls.pendingUrl },
      auto_return: 'approved' as const,
      external_reference: order.code,
      expires: true,
      expiration_date_from: new Date(windowStart).toISOString(),
      expiration_date_to: expiresAt.toISOString(),
      metadata: { channel_code: ctx.channel.code, order_code: order.code },
      // Application mode sends no `notification_url`: the app-level webhook is used (PRD 9.7).
      ...(this.options.webhookMode === 'preference'
        ? {
            notification_url: `${this.options.publicUrl.replace(/\/$/, '')}/mercadopago/webhook/${ctx.channel.token}?source_news=webhooks`,
          }
        : {}),
    };
    const idempotencyKey = createHash('sha256')
      .update(JSON.stringify([ctx.channelId, order.code, order.totalWithTax, urls, windowStart]))
      .digest('hex');

    try {
      const preference = await this.api.createPreference(accessToken, body, idempotencyKey);
      return {
        preferenceId: preference.id,
        initPoint: preference.init_point,
        sandboxInitPoint: preference.sandbox_init_point ?? null,
        expiresAt,
      };
    } catch (error) {
      if (error instanceof MercadoPagoApiError) {
        Logger.warn(
          `Preference creation failed for order ${order.code}: ${error.kind} ${error.message}`,
          loggerCtx,
        );
        throw new CheckoutError(
          'MERCADOPAGO_UNAVAILABLE',
          'Mercado Pago could not create the payment. Try again in a moment.',
        );
      }
      throw error;
    }
  }

  /**
   * Return URLs must be https, not local (Mercado Pago rule) and on the store's own origin, so a
   * buyer is never sent to a domain the store did not configure.
   */
  private assertBackUrls(channel: Channel, urls: BackUrls): void {
    const configured = channel.customFields?.[STOREFRONT_URL_FIELD];
    if (!configured) {
      throw new CheckoutError(
        'STOREFRONT_NOT_CONFIGURED',
        'The storefront URL of this store is not configured.',
      );
    }
    const allowedOrigin = new URL(configured).origin;
    for (const value of Object.values(urls)) {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new CheckoutError('INVALID_BACK_URL', 'A return URL is not a valid URL.');
      }
      if (
        url.protocol !== 'https:' ||
        LOCAL_HOST.test(url.hostname) ||
        url.origin !== allowedOrigin
      ) {
        throw new CheckoutError(
          'INVALID_BACK_URL',
          'Return URLs must be https URLs on the store storefront domain.',
        );
      }
    }
  }

  private buildItems(order: Order) {
    const total = order.totalWithTax;
    if (this.options.preferenceItemsMode === 'lines') {
      // One item per line (quantity 1 with the line total, so cents never get lost in
      // `unit_price * quantity`) plus shipping. Falls back to one total line on any mismatch.
      const items = order.lines.map((line) => ({
        id: line.productVariant?.sku || String(line.id),
        title: `${line.productVariant?.name ?? 'Item'} x ${line.quantity}`.slice(
          0,
          MAX_TITLE_LENGTH,
        ),
        quantity: 1,
        unit_price: toMercadoPagoAmount(line.proratedLinePriceWithTax),
        currency_id: 'ARS',
      }));
      if (order.shippingWithTax > 0) {
        items.push({
          id: 'shipping',
          title: 'Envío',
          quantity: 1,
          unit_price: toMercadoPagoAmount(order.shippingWithTax),
          currency_id: 'ARS',
        });
      }
      const sum = items.reduce((acc, item) => acc + Math.round(item.unit_price * 100), 0);
      if (items.length > 0 && sum === total) return items;
      Logger.warn(
        `Order ${order.code}: item lines add up to ${sum}, the total is ${total}. Sending a single total line.`,
        loggerCtx,
      );
    }
    return [
      {
        id: order.code,
        title: `Pedido ${order.code}`,
        quantity: 1,
        unit_price: toMercadoPagoAmount(total),
        currency_id: 'ARS',
      },
    ];
  }

  private buildPayer(order: Order) {
    const customer = order.customer;
    return customer?.emailAddress
      ? {
          email: customer.emailAddress,
          name: customer.firstName || undefined,
          surname: customer.lastName || undefined,
        }
      : undefined;
  }
}
