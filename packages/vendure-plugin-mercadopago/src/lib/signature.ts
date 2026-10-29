import { InvalidWebhookSignatureError, WebhookSignatureValidator } from 'mercadopago';

export interface WebhookSignatureInput {
  /** `x-signature` header (`ts=...,v1=...`). */
  xSignature: string | string[] | undefined;
  /** `x-request-id` header. */
  xRequestId: string | string[] | undefined;
  /** `data.id` query parameter of the notification URL. */
  dataId: string | string[] | undefined;
  /** Webhook secret key from "Tus integraciones". */
  secret: string;
  /** Rejects notifications whose `ts` is further than this from `now` (PRD 9.7, design). */
  toleranceSeconds?: number;
  /** Clock in epoch milliseconds, injectable for tests. */
  now?: () => number;
}

export type WebhookSignatureResult = { valid: true } | { valid: false; reason: string };

const TS_PATTERN = /(?:^|,)\s*ts=(\d+)/;
// Epoch seconds are 10 digits until the year 2286; epoch milliseconds are 13.
const MILLISECOND_THRESHOLD = 1e11;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function timestampToMillis(ts: number): number {
  return ts >= MILLISECOND_THRESHOLD ? ts : ts * 1000;
}

/**
 * Number of digits of the `ts` in an `x-signature` header (10 = seconds, 13 = milliseconds), or
 * undefined when there is none. Logged to settle which unit Mercado Pago really sends (V18).
 */
export function signatureTimestampDigits(
  xSignature: string | string[] | undefined,
): number | undefined {
  return TS_PATTERN.exec(first(xSignature) ?? '')?.[1].length;
}

/**
 * Validates the `x-signature` of a Mercado Pago notification.
 *
 * The HMAC is checked by the SDK's `WebhookSignatureValidator`. Two details are handled here
 * because the SDK does not (see DECISIONS.md):
 * - the documentation requires `data.id` in lowercase when it is alphanumeric, the SDK does not;
 * - the documentation calls `ts` milliseconds while its own example and the SDK use seconds, so
 *   the tolerance check accepts both.
 */
export function verifyWebhookSignature(input: WebhookSignatureInput): WebhookSignatureResult {
  const dataId = first(input.dataId)?.trim().toLowerCase();
  try {
    WebhookSignatureValidator.validate({
      xSignature: input.xSignature,
      xRequestId: input.xRequestId,
      dataId,
      secret: input.secret,
    });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      return { valid: false, reason: error.reason };
    }
    throw error;
  }

  if (input.toleranceSeconds !== undefined) {
    const ts = Number(TS_PATTERN.exec(first(input.xSignature) ?? '')?.[1]);
    const now = (input.now ?? Date.now)();
    if (
      !Number.isFinite(ts) ||
      Math.abs(now - timestampToMillis(ts)) > input.toleranceSeconds * 1000
    ) {
      return { valid: false, reason: 'TimestampOutOfTolerance' };
    }
  }
  return { valid: true };
}
