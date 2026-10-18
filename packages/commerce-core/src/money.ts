import type { Cents } from './types';

/**
 * Formats an amount in cents for display: `129900` -> "$ 1.299,00" in es-AR.
 * Amounts are never floats in this package; convert only here, at the edge.
 */
export function formatMoney(cents: Cents, currency = 'ARS', locale = 'es-AR'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}
