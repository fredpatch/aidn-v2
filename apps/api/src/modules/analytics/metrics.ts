/** ROLE-ANALYTICS-1B - analytics calculation helpers shared by the global
 *  overview and the role analytics. Moved unchanged from analytics.service.ts.
 *  Durations are calendar days with one decimal. */

const DAY_MS = 86_400_000;

/** Inclusive on both ends (the global overview's legacy semantics). Role
 *  analytics use half-open periods: compare with `start <= t < end` instead. */
export function inPeriod(date: Date | string | null, start: Date, end: Date): boolean {
  if (!date) return false;
  const time = new Date(date).getTime();
  return time >= start.getTime() && time <= end.getTime();
}

/** Calendar days between two instants, one decimal; null when either is
 *  missing or invalid, or when end precedes start. */
export function daysBetween(start: Date | string | null, end: Date | string | null): number | null {
  if (!start || !end) return null;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return null;
  return Number(((endTime - startTime) / DAY_MS).toFixed(1));
}

/** Mean of the finite values, one decimal; null for an empty sample. */
export function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!valid.length) return null;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(1));
}

/** Median of the finite values, one decimal; null for an empty sample. */
export function median(values: Array<number | null>): number | null {
  const valid = values
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  if (valid.length % 2) return Number(valid[middle].toFixed(1));
  return Number(((valid[middle - 1] + valid[middle]) / 2).toFixed(1));
}

/** Rounded percentage text for the global overview ('-' when total is 0). */
export function percent(part: number, total: number): string {
  return total <= 0 ? '-' : `${Math.round((part / total) * 100)}%`;
}
