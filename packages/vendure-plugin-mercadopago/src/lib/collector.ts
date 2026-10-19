export type CollectorCheck =
  { ok: true } | { ok: false; reason: 'collector_mismatch' | 'collector_missing' };

/**
 * A payment is only accepted for the account whose token was used to read it: Mercado Pago must
 * name that same account as the collector (PRD 9.7). A different collector means the token could
 * read somebody else's payment (for example one whose `external_reference` was forged), and a
 * missing one means the account cannot be confirmed. Either way the payment is never accepted
 * silently.
 */
export function checkCollector(
  payment: { collector_id?: number | string | null },
  accountUserId: string,
): CollectorCheck {
  const collector = payment.collector_id;
  if (collector === undefined || collector === null || collector === '') {
    return { ok: false, reason: 'collector_missing' };
  }
  return String(collector) === accountUserId
    ? { ok: true }
    : { ok: false, reason: 'collector_mismatch' };
}
