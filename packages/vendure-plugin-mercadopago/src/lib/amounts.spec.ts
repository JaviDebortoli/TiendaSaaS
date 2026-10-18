import { describe, expect, it } from 'vitest';
import { amountMatchesTotal, fromMercadoPagoAmount, toMercadoPagoAmount } from './amounts';

describe('toMercadoPagoAmount', () => {
  it.each([
    [0, 0],
    [1, 0.01],
    [1010, 10.1],
    [1999, 19.99],
    [12345600, 123456],
  ])('%i minor units -> %d', (minor, expected) => {
    expect(toMercadoPagoAmount(minor)).toBe(expected);
  });

  it('rejects non-integer, negative or non-finite input', () => {
    expect(() => toMercadoPagoAmount(10.5)).toThrow(RangeError);
    expect(() => toMercadoPagoAmount(-1)).toThrow(RangeError);
    expect(() => toMercadoPagoAmount(Number.NaN)).toThrow(RangeError);
  });
});

describe('fromMercadoPagoAmount', () => {
  it.each([
    [0, 0],
    [0.29, 29],
    [10.1, 1010],
    [19.99, 1999],
    [123456, 12345600],
  ])('%d -> %i minor units (float noise removed)', (amount, expected) => {
    expect(fromMercadoPagoAmount(amount)).toBe(expected);
  });

  it('round-trips every amount with cents', () => {
    for (let minor = 0; minor <= 100000; minor += 7) {
      expect(fromMercadoPagoAmount(toMercadoPagoAmount(minor))).toBe(minor);
    }
  });

  it('rejects negative or non-finite input', () => {
    expect(() => fromMercadoPagoAmount(-0.01)).toThrow(RangeError);
    expect(() => fromMercadoPagoAmount(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('amountMatchesTotal', () => {
  it('matches the exact total only', () => {
    expect(amountMatchesTotal(19.99, 1999)).toBe(true);
    expect(amountMatchesTotal(19.98, 1999)).toBe(false);
    expect(amountMatchesTotal(20, 1999)).toBe(false);
  });
});
