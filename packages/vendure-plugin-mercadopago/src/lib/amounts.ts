/**
 * Amount conversion between Vendure (integer minor units, e.g. cents) and Mercado Pago
 * (decimal major units). Every currency of the platform is ARS, which has two decimals (PRD 7).
 */
const MINOR_UNITS_PER_MAJOR = 100;

function assertMinorUnits(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`Expected a non-negative integer amount in minor units, got ${amount}.`);
  }
}

/** Vendure minor units -> Mercado Pago decimal amount (`unit_price`, refund `amount`). */
export function toMercadoPagoAmount(minorUnits: number): number {
  assertMinorUnits(minorUnits);
  return minorUnits / MINOR_UNITS_PER_MAJOR;
}

/** Mercado Pago decimal amount -> Vendure minor units, rounding away float noise (0.29 * 100). */
export function fromMercadoPagoAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`Expected a non-negative finite amount, got ${amount}.`);
  }
  return Math.round(amount * MINOR_UNITS_PER_MAJOR);
}

/** True when a Mercado Pago amount equals the Vendure order total exactly, in minor units. */
export function amountMatchesTotal(mercadoPagoAmount: number, totalMinorUnits: number): boolean {
  return fromMercadoPagoAmount(mercadoPagoAmount) === totalMinorUnits;
}
