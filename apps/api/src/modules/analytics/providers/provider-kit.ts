/** ROLE-ANALYTICS-1C - building blocks shared by the role analytics providers.
 *
 *  Scope rule: `mine` carries only what the audit attributes to the viewer
 *  (historical event counts and activity). Service-wide process durations and
 *  the current shared queues (Courriers, Circuit Directeur DN) belong to no
 *  one, so they appear in `service` only, never relabelled as personal. */
import type {
  RoleAnalyticsMetric,
  RoleAnalyticsPeriod,
  RoleAnalyticsWarning,
} from '@aidn/shared';
import { countLabel, type CountNoun } from '@aidn/shared';
import { countCircuitEvents, type CircuitEventSpec } from './circuit-events.js';
import { previousRange, type DurationSample, type TimeRange } from './sql.js';

/** Recent activity cap (newest first, within the period; no pagination). */
export const RECENT_ACTIVITY_LIMIT = 10;

export function rangeOf(period: RoleAnalyticsPeriod): TimeRange {
  return { start: new Date(period.start), end: new Date(period.end) };
}

/** Event count in the period and in the same-length period before it. */
export function eventCountMetric(
  key: string,
  spec: CircuitEventSpec,
  range: TimeRange,
  actorId: number | null
): Promise<RoleAnalyticsMetric> {
  return periodCountMetric(key, (r) => countCircuitEvents(spec, r, actorId), range);
}

/** Events timed by audit_logs.created_at: rows written before the UTC session
 *  pin (ROLE-ANALYTICS-1B) on a non-UTC server may be offset by whole hours
 *  (gotchas #27). Targeted caveat for audit-timed metrics only; app-written
 *  row timestamps stay reliable. Drop it once production history is checked. */
export const AUDIT_TIME_CAVEAT = 'legacy_db_timezone';

/** A count in the period and in the same-length period before it. */
export async function periodCountMetric(
  key: string,
  count: (range: TimeRange) => Promise<number>,
  range: TimeRange,
  caveatKey?: string
): Promise<RoleAnalyticsMetric> {
  const [value, previousValue] = await Promise.all([count(range), count(previousRange(range))]);
  return {
    key,
    value,
    unit: 'count',
    basis: 'period',
    ...(caveatKey ? { reliability: 'caveat' as const, caveatKey } : { reliability: 'reliable' as const }),
    previousValue,
  };
}

/** `noun` says what one sampled row is (the provider knows; the screen does not guess). */
export function durationMetric(
  key: string,
  sample: DurationSample,
  noun: CountNoun,
  caveatKey?: string
): RoleAnalyticsMetric {
  return {
    key,
    value: sample.value,
    unit: 'calendar_days',
    basis: 'period',
    sampleSize: sample.sampleSize,
    sampleLabel: countLabel(sample.sampleSize, noun),
    ...(caveatKey ? { reliability: 'caveat' as const, caveatKey } : { reliability: 'reliable' as const }),
  };
}

export function currentCountMetric(key: string, value: number): RoleAnalyticsMetric {
  return { key, value, unit: 'count', basis: 'current', reliability: 'reliable' };
}

interface QueueRow {
  id: string;
  requestId: number;
  requestReference: string;
  stepSince: string | null;
}

/** Oldest row by `stepSince` (the queue's authoritative step start); a row
 *  without one is never picked (no invented date). */
export function oldestOf<T extends QueueRow>(rows: readonly T[]): (T & { stepSince: string }) | null {
  let oldest: (T & { stepSince: string }) | null = null;
  for (const row of rows) {
    if (row.stepSince !== null && (!oldest || row.stepSince < oldest.stepSince)) oldest = row as T & { stepSince: string };
  }
  return oldest;
}

/** A warning over queue rows, or null when there are none. `href` receives
 *  the oldest row (deep link to its tab and selection). */
export function queueWarning<T extends QueueRow>(
  key: string,
  severity: RoleAnalyticsWarning['severity'],
  rows: readonly T[],
  href: (oldest: T) => string
): RoleAnalyticsWarning | null {
  const oldest = oldestOf(rows);
  if (!oldest) return null;
  return {
    key,
    severity,
    count: rows.length,
    oldest: { requestId: oldest.requestId, requestReference: oldest.requestReference, since: oldest.stepSince, itemId: oldest.id },
    href: href(oldest),
  };
}
