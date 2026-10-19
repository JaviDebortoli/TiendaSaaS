import { Inject, Injectable } from '@nestjs/common';
import {
  MercadoPagoConfig,
  MercadoPagoError,
  MerchantOrder,
  Payment,
  PaymentRefund,
  Preference,
} from 'mercadopago';
import type { MerchantOrderResponse } from 'mercadopago/dist/clients/merchantOrder/commonTypes';
import type { PaymentResponse } from 'mercadopago/dist/clients/payment/commonTypes';
import type { PreferenceRequest } from 'mercadopago/dist/clients/preference/commonTypes';
import { MERCADOPAGO_API_URL, MP_PLUGIN_OPTIONS } from '../constants';
import type { ResolvedMercadoPagoOptions } from '../types';

export type ApiErrorKind =
  /** The token is invalid, expired or revoked (HTTP 401/403). */
  | 'auth'
  | 'not_found'
  /** Mercado Pago refused the request (HTTP 4xx), e.g. refund without balance. */
  | 'rejected'
  /** `invalid_grant` on an OAuth exchange: code or refresh token no longer valid. */
  | 'invalid_grant'
  | 'unavailable'
  | 'unknown';

export class MercadoPagoApiError extends Error {
  constructor(
    message: string,
    readonly kind: ApiErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MercadoPagoApiError';
  }
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  public_key?: string;
  user_id?: number | string;
  expires_in?: number;
  scope?: string;
  live_mode?: boolean;
  token_type?: string;
}

export interface PreferenceResult {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
}

export type MercadoPagoPayment = PaymentResponse;
export type MercadoPagoMerchantOrder = MerchantOrderResponse;

const REQUEST_TIMEOUT_MS = 10_000;

/** Thin wrapper over the Mercado Pago SDK (payments side) and `fetch` (OAuth side, see DEC-10). */
@Injectable()
export class MercadoPagoApiService {
  constructor(@Inject(MP_PLUGIN_OPTIONS) private readonly options: ResolvedMercadoPagoOptions) {}

  async createPreference(
    accessToken: string,
    body: PreferenceRequest,
    idempotencyKey: string,
  ): Promise<PreferenceResult> {
    const response = await this.call(() =>
      new Preference(this.config(accessToken)).create({ body, requestOptions: { idempotencyKey } }),
    );
    if (!response.id || !response.init_point) {
      throw new MercadoPagoApiError('Mercado Pago returned an incomplete preference.', 'unknown');
    }
    return {
      id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point,
    };
  }

  getPayment(accessToken: string, paymentId: string): Promise<MercadoPagoPayment> {
    return this.call(() => new Payment(this.config(accessToken)).get({ id: paymentId }));
  }

  /** The merchant order a payment belongs to; its `preference_id` says which preference it came from. */
  getMerchantOrder(
    accessToken: string,
    merchantOrderId: string,
  ): Promise<MercadoPagoMerchantOrder> {
    return this.call(() => new MerchantOrder(this.config(accessToken)).get({ merchantOrderId }));
  }

  cancelPayment(accessToken: string, paymentId: string): Promise<MercadoPagoPayment> {
    return this.call(() => new Payment(this.config(accessToken)).cancel({ id: paymentId }));
  }

  /** Full refund when `amount` is omitted (empty body), partial otherwise (PRD 9.9). */
  async refundPayment(
    accessToken: string,
    paymentId: string,
    amount?: number,
    idempotencyKey?: string,
  ): Promise<{ id: string }> {
    const response = await this.call(() =>
      new PaymentRefund(this.config(accessToken)).create({
        payment_id: paymentId,
        body: amount === undefined ? {} : { amount },
        requestOptions: idempotencyKey ? { idempotencyKey } : undefined,
      }),
    );
    return { id: String(response.id) };
  }

  /** Cheap authenticated call used to find out whether a token still works. */
  async checkToken(accessToken: string): Promise<void> {
    await this.fetchJson(`${MERCADOPAGO_API_URL}/users/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<OAuthTokenResponse> {
    return this.requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.options.redirectUri,
      code_verifier: codeVerifier,
      test_token: String(this.options.oauthTestToken),
    });
  }

  refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    return this.requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  private async requestToken(params: Record<string, string>): Promise<OAuthTokenResponse> {
    const body = {
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      ...params,
    };
    const json = (await this.fetchJson(`${MERCADOPAGO_API_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })) as Partial<OAuthTokenResponse>;
    if (!json.access_token || !json.refresh_token) {
      throw new MercadoPagoApiError('OAuth response did not include tokens.', 'unknown');
    }
    return json as OAuthTokenResponse;
  }

  private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      throw new MercadoPagoApiError(
        `Could not reach Mercado Pago: ${error instanceof Error ? error.message : String(error)}`,
        'unavailable',
      );
    }
    const text = await response.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // Non JSON bodies are reported through the status code below.
    }
    if (!response.ok) {
      const message = String(
        json.message ?? json.error_description ?? json.error ?? 'Request failed',
      );
      const kind: ApiErrorKind =
        json.error === 'invalid_grant'
          ? 'invalid_grant'
          : response.status === 401 || response.status === 403
            ? 'auth'
            : response.status === 404
              ? 'not_found'
              : response.status >= 500 || response.status === 429
                ? 'unavailable'
                : 'rejected';
      throw new MercadoPagoApiError(message, kind, response.status);
    }
    return json;
  }

  private config(accessToken: string): MercadoPagoConfig {
    return new MercadoPagoConfig({ accessToken, options: { timeout: REQUEST_TIMEOUT_MS } });
  }

  /** Converts SDK errors into `MercadoPagoApiError` so callers never depend on SDK classes. */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof MercadoPagoApiError) throw error;
      if (error instanceof MercadoPagoError) {
        const status = error.status;
        const kind: ApiErrorKind =
          status === 401 || status === 403
            ? 'auth'
            : status === 404
              ? 'not_found'
              : status >= 500 || status === 429
                ? 'unavailable'
                : 'rejected';
        throw new MercadoPagoApiError(error.message, kind, status);
      }
      throw new MercadoPagoApiError(
        error instanceof Error ? error.message : 'Unexpected Mercado Pago error',
        'unavailable',
      );
    }
  }
}
