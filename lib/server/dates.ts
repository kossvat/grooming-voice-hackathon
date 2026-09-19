// Server-side date/time validation for API inputs (real calendar dates and
// bounded HH:mm). Mirrors lib/domain/time.ts semantics but with no timezone
// math — these only prove a string is a real calendar date / valid time.

/** True only for a real calendar date, e.g. rejects 2026-02-30 or 2026-13-01. */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() === m - 1 &&
    check.getUTCDate() === d
  );
}

/** True only for a bounded 24h "HH:mm" string (00:00–23:59). */
export function isValidTimeOfDay(timeStr: string): boolean {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr)) return false;
  return true;
}
