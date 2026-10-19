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
import { countCircuitEvents, previousRange, type CircuitEventSpec, type DurationSample, type TimeRange } from './circuit-events.js';

/** Recent activity cap (newest first, within the period; no pagination). */
export const RECENT_ACTIVITY_LIMIT = 10;

export function rangeOf(period: RoleAnalyticsPeriod): TimeRange {
  return { start: new Date(period.start), end: new Date(period.end) };
}

/** Event count in the period and in the same-length period before it. */
export async function eventCountMetric(
  key: string,
  spec: CircuitEventSpec,
  range: TimeRange,
  actorId: number | null
): Promise<RoleAnalyticsMetric> {
  const [value, previousValue] = await Promise.all([
    countCircuitEvents(spec, range, actorId),
    countCircuitEvents(spec, previousRange(range), actorId),
  ]);
  return { key, value, unit: 'count', basis: 'period', reliability: 'reliable', previousValue };
}

export function durationMetric(key: string, sample: DurationSample): RoleAnalyticsMetric {
  return {
    key,
    value: sample.value,
    unit: 'calendar_days',
    basis: 'period',
    sampleSize: sample.sampleSize,
    reliability: 'reliable',
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
