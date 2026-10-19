/** ROLE-ANALYTICS-1C/1D - SQL fragments shared by the role analytics providers. */
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../../../shared/db/index.js';

/** Half-open UTC range [start, end). */
export interface TimeRange {
  start: Date;
  end: Date;
}

/** The same-length range just before `range` (trend comparison). Periods are
 *  whole Libreville days, so the bounds stay Libreville midnights; for a
 *  month preset it is the same number of days, not the previous calendar
 *  month. */
export function previousRange(range: TimeRange): TimeRange {
  const length = range.end.getTime() - range.start.getTime();
  return { start: new Date(range.start.getTime() - length), end: range.start };
}

/** `a, b, c` as bound parameters (callers pass a non-empty list). */
export const list = (values: readonly string[]): SQL => sql.join(values.map((value) => sql`${value}`), sql`, `);

/** A UTC instant as a `timestamp` (without time zone) literal: the column's
 *  index stays usable. */
export const utc = (date: Date): SQL => sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

/** `expression` within `range` (half-open). */
export const within = (expression: SQL, range: TimeRange): SQL =>
  sql`${expression} >= ${utc(range.start)} AND ${expression} < ${utc(range.end)}`;

/** A `timestamp` column as epoch milliseconds, read as UTC whatever the
 *  driver's local parsing of `timestamp` values. */
export const epochMs = (expression: SQL): SQL => sql`(extract(epoch from ${expression}) * 1000)::float8`;

export interface DurationSample {
  /** Mean calendar days, one decimal; null for an empty sample. */
  value: number | null;
  sampleSize: number;
}

/** Mean `from` -> `to` in calendar days over `source` (a FROM ... WHERE ...
 *  clause); a missing `from` or a negative duration is left out of the sample. */
export async function averageDays(source: SQL, from: SQL, to: SQL): Promise<DurationSample> {
  const result = await db.execute<{ days: string | null; sample: number }>(
    sql`SELECT round((avg(extract(epoch from (${to} - ${from}))) / 86400)::numeric, 1)::text AS days, count(*)::int AS sample
        ${source} AND ${from} IS NOT NULL AND ${to} >= ${from}`
  );
  const row = result.rows[0];
  return { value: row?.days == null ? null : Number(row.days), sampleSize: row?.sample ?? 0 };
}
