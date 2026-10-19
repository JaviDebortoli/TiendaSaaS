import { describe, expect, it } from 'vitest';
import { checkCollector } from './collector';

describe('checkCollector', () => {
  it('accepts a payment collected by the account it was read with', () => {
    expect(checkCollector({ collector_id: 1234 }, '1234')).toEqual({ ok: true });
    expect(checkCollector({ collector_id: '1234' }, '1234')).toEqual({ ok: true });
  });

  it('rejects a payment collected by another account', () => {
    expect(checkCollector({ collector_id: 999 }, '1234')).toEqual({
      ok: false,
      reason: 'collector_mismatch',
    });
  });

  it('rejects a payment that does not say who collected it', () => {
    for (const payment of [{}, { collector_id: null }, { collector_id: '' }]) {
      expect(checkCollector(payment, '1234')).toEqual({ ok: false, reason: 'collector_missing' });
    }
  });

  it('does not treat a near miss as a match', () => {
    expect(checkCollector({ collector_id: 12345 }, '1234')).toEqual({
      ok: false,
      reason: 'collector_mismatch',
    });
    expect(checkCollector({ collector_id: 0 }, '0')).toEqual({ ok: true });
  });
});
