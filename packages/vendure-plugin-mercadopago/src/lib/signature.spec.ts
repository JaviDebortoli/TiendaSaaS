import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signatureTimestampDigits, verifyWebhookSignature } from './signature';

const SECRET = 'test-webhook-secret';
const NOW_MS = 1_704_908_010_000;

/** Independent implementation of the documented algorithm, used to sign test notifications. */
function sign(opts: { dataId?: string; requestId?: string; ts: string; secret?: string }): string {
  const parts: string[] = [];
  if (opts.dataId) parts.push(`id:${opts.dataId}`);
  if (opts.requestId) parts.push(`request-id:${opts.requestId}`);
  parts.push(`ts:${opts.ts}`);
  const v1 = createHmac('sha256', opts.secret ?? SECRET)
    .update(`${parts.join(';')};`)
    .digest('hex');
  return `ts=${opts.ts},v1=${v1}`;
}

const base = { secret: SECRET, now: () => NOW_MS };
const TS = '1704908010';

describe('verifyWebhookSignature', () => {
  it('accepts a correctly signed notification', () => {
    expect(
      verifyWebhookSignature({
        ...base,
        xSignature: sign({ dataId: '123456', requestId: 'req-1', ts: TS }),
        xRequestId: 'req-1',
        dataId: '123456',
      }),
    ).toEqual({ valid: true });
  });

  it('lowercases an alphanumeric data.id before building the manifest', () => {
    const xSignature = sign({ dataId: 'abc123xyz', requestId: 'req-1', ts: TS });
    expect(
      verifyWebhookSignature({ ...base, xSignature, xRequestId: 'req-1', dataId: 'ABC123XYZ' }),
    ).toEqual({ valid: true });
  });

  it('omits missing pairs from the manifest', () => {
    expect(
      verifyWebhookSignature({
        ...base,
        xSignature: sign({ requestId: 'req-1', ts: TS }),
        xRequestId: 'req-1',
        dataId: undefined,
      }),
    ).toEqual({ valid: true });
    expect(
      verifyWebhookSignature({
        ...base,
        xSignature: sign({ dataId: '1', ts: TS }),
        xRequestId: undefined,
        dataId: '1',
      }),
    ).toEqual({ valid: true });
  });

  it('rejects a notification signed with another secret', () => {
    const result = verifyWebhookSignature({
      ...base,
      xSignature: sign({ dataId: '1', requestId: 'r', ts: TS, secret: 'other' }),
      xRequestId: 'r',
      dataId: '1',
    });
    expect(result).toEqual({ valid: false, reason: 'SignatureMismatch' });
  });

  it('rejects when a signed field was altered (data.id swapped)', () => {
    const result = verifyWebhookSignature({
      ...base,
      xSignature: sign({ dataId: '1', requestId: 'r', ts: TS }),
      xRequestId: 'r',
      dataId: '2',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects missing and malformed headers without throwing', () => {
    const common = { ...base, xRequestId: 'r', dataId: '1' };
    expect(verifyWebhookSignature({ ...common, xSignature: undefined })).toEqual({
      valid: false,
      reason: 'MissingSignatureHeader',
    });
    expect(verifyWebhookSignature({ ...common, xSignature: 'garbage' }).valid).toBe(false);
    expect(verifyWebhookSignature({ ...common, xSignature: 'ts=1704908010' }).valid).toBe(false);
  });

  describe('timestamp tolerance', () => {
    const run = (ts: string, toleranceSeconds = 300) =>
      verifyWebhookSignature({
        ...base,
        toleranceSeconds,
        xSignature: sign({ dataId: '1', requestId: 'r', ts }),
        xRequestId: 'r',
        dataId: '1',
      });
    const outOfTolerance = { valid: false, reason: 'TimestampOutOfTolerance' };

    it('accepts timestamps in seconds and in milliseconds within the window', () => {
      expect(run(TS)).toEqual({ valid: true });
      expect(run('1704908010000')).toEqual({ valid: true });
      expect(run(String(1704908010 - 299))).toEqual({ valid: true });
    });

    it('rejects stale and future timestamps in either unit (replay protection)', () => {
      expect(run(String(1704908010 - 301))).toEqual(outOfTolerance);
      expect(run(String(1704908010 + 301))).toEqual(outOfTolerance);
      expect(run(String(NOW_MS - 301_000))).toEqual(outOfTolerance);
    });

    it('does not apply the window when no tolerance is configured', () => {
      const result = verifyWebhookSignature({
        ...base,
        xSignature: sign({ dataId: '1', requestId: 'r', ts: '1000000000' }),
        xRequestId: 'r',
        dataId: '1',
      });
      expect(result).toEqual({ valid: true });
    });
  });
});

describe('signatureTimestampDigits', () => {
  it('counts the digits of a timestamp in seconds', () => {
    expect(signatureTimestampDigits('ts=1704908010,v1=abc')).toBe(10);
  });

  it('counts the digits of a timestamp in milliseconds', () => {
    expect(signatureTimestampDigits('ts=1704908010000,v1=abc')).toBe(13);
  });

  it('finds ts when it is not the first pair and reads the first header value', () => {
    expect(signatureTimestampDigits(['v1=abc, ts=1704908010', 'ts=1'])).toBe(10);
  });

  it('is undefined without a header or without ts', () => {
    expect(signatureTimestampDigits(undefined)).toBeUndefined();
    expect(signatureTimestampDigits('v1=abc')).toBeUndefined();
  });
});
