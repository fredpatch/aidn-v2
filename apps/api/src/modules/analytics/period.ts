/** ROLE-ANALYTICS-1B - analytics periods in Libreville business days, as
 *  half-open UTC ranges [start, end). Gabon is UTC+1 all year (no daylight
 *  saving), the convention of @aidn/shared workingDays: a fixed offset is
 *  exact, and only Date.UTC arithmetic is used, so the server's own time
 *  zone never moves a boundary. */
import {
  ANALYTICS_BUSINESS_TIME_ZONE,
  ROLE_ANALYTICS_PRESETS,
  type RoleAnalyticsPeriod,
  type RoleAnalyticsPreset,
} from '@aidn/shared';

const DAY_MS = 86_400_000;
const LIBREVILLE_OFFSET_MS = 3_600_000;
export const MAX_CUSTOM_PERIOD_DAYS = 366;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A Libreville calendar day, as UTC-midnight milliseconds of that date. */
type DayKey = number;

function todayInLibreville(now: Date): DayKey {
  const shifted = new Date(now.getTime() + LIBREVILLE_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

function addDays(day: DayKey, days: number): DayKey {
  return day + days * DAY_MS;
}

function monthStart(day: DayKey, monthOffset: number): DayKey {
  const date = new Date(day);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1);
}

/** Libreville midnight of `day`, as a UTC instant. */
function startOfDay(day: DayKey): Date {
  return new Date(day - LIBREVILLE_OFFSET_MS);
}

function dateText(day: DayKey): string {
  return new Date(day).toISOString().slice(0, 10);
}

function parseIsoDate(value: unknown): DayKey {
  if (typeof value !== 'string') throw new Error('INVALID_ANALYTICS_PERIOD');
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error('INVALID_ANALYTICS_PERIOD');
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const key = Date.UTC(year, month - 1, day);
  const date = new Date(key);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('INVALID_ANALYTICS_PERIOD');
  }
  return key;
}

function isPreset(value: unknown): value is RoleAnalyticsPreset {
  return typeof value === 'string' && (ROLE_ANALYTICS_PRESETS as readonly string[]).includes(value);
}

/** `from` / `to` are inclusive Libreville dates; the range is [first, lastExclusive). */
function build(preset: RoleAnalyticsPreset, first: DayKey, lastExclusive: DayKey): RoleAnalyticsPeriod {
  return {
    preset,
    start: startOfDay(first).toISOString(),
    end: startOfDay(lastExclusive).toISOString(),
    timeZone: ANALYTICS_BUSINESS_TIME_ZONE,
    displayFrom: dateText(first),
    displayTo: dateText(addDays(lastExclusive, -1)),
  };
}

/** Throws INVALID_ANALYTICS_PERIOD for an unknown preset, a custom period
 *  without both dates, a date that is not a real YYYY-MM-DD, from > to, or
 *  more than MAX_CUSTOM_PERIOD_DAYS calendar days. */
export function resolveAnalyticsPeriod(
  input: { period?: unknown; from?: unknown; to?: unknown },
  now: Date = new Date()
): RoleAnalyticsPeriod {
  if (!isPreset(input.period)) throw new Error('INVALID_ANALYTICS_PERIOD');
  const today = todayInLibreville(now);
  switch (input.period) {
    case 'today':
      return build('today', today, addDays(today, 1));
    case 'last_7_days':
      return build('last_7_days', addDays(today, -6), addDays(today, 1));
    case 'last_30_days':
      return build('last_30_days', addDays(today, -29), addDays(today, 1));
    case 'this_month':
      return build('this_month', monthStart(today, 0), monthStart(today, 1));
    case 'previous_month':
      return build('previous_month', monthStart(today, -1), monthStart(today, 0));
    case 'custom': {
      const from = parseIsoDate(input.from);
      const to = parseIsoDate(input.to);
      if (from > to) throw new Error('INVALID_ANALYTICS_PERIOD');
      if ((to - from) / DAY_MS + 1 > MAX_CUSTOM_PERIOD_DAYS) throw new Error('INVALID_ANALYTICS_PERIOD');
      return build('custom', from, addDays(to, 1));
    }
  }
}
