/** True for a unique-constraint violation on PostgreSQL (23505) and on SQLite / SQL.js. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; message?: string; driverError?: { code?: string } };
  return (
    e?.code === '23505' ||
    e?.driverError?.code === '23505' ||
    /unique constraint/i.test(e?.message ?? '')
  );
}
