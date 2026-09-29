/** M1 - working days (jours ouvrés) for the Circuit DG: Monday to Friday,
 *  minus DN's public holidays (system parameter `public_holidays`).
 *
 *  Days are Libreville calendar days. Gabon is UTC+1 all year (no daylight
 *  saving), so a fixed offset is exact and the server's own time zone (often
 *  UTC in Docker) never shifts a day boundary. */

const DAY_MS = 86_400_000;
const LIBREVILLE_OFFSET_MS = 3_600_000;

export interface PublicHolidays {
  /** "YYYY-MM-DD": that date only (movable holidays: Easter Monday, Eids...). */
  dated: Set<string>;
  /** "MM-DD": every year (fixed holidays). */
  everyYear: Set<string>;
}

const DATED = /^(\d{4})-(\d{2})-(\d{2})$/;
const EVERY_YEAR = /^(\d{2})-(\d{2})$/;

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Splits on commas, semicolons and whitespace. `invalid` lists entries that
 *  are not real dates in either format (2000 is a leap year, so 02-29 is a
 *  valid every-year entry). */
export function parsePublicHolidays(text: string): { holidays: PublicHolidays; invalid: string[]; entries: string[] } {
  const holidays: PublicHolidays = { dated: new Set(), everyYear: new Set() };
  const invalid: string[] = [];
  const entries: string[] = [];

  for (const entry of text.split(/[\s,;]+/).filter(Boolean)) {
    const dated = DATED.exec(entry);
    const everyYear = EVERY_YEAR.exec(entry);
    if (dated && isRealDate(Number(dated[1]), Number(dated[2]), Number(dated[3]))) {
      holidays.dated.add(entry);
    } else if (everyYear && isRealDate(2000, Number(everyYear[1]), Number(everyYear[2]))) {
      holidays.everyYear.add(entry);
    } else {
      invalid.push(entry);
      continue;
    }
    if (!entries.includes(entry)) entries.push(entry);
  }

  return { holidays, invalid, entries };
}

/** Index of the Libreville calendar day containing `localMs`. */
function dayIndex(localMs: number): number {
  return Math.floor(localMs / DAY_MS);
}

function isWorkingDayIndex(index: number, holidays: PublicHolidays): boolean {
  const date = new Date(index * DAY_MS);
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const iso = date.toISOString().slice(0, 10);
  return !holidays.dated.has(iso) && !holidays.everyYear.has(iso.slice(5));
}

export function isWorkingDay(date: Date, holidays: PublicHolidays): boolean {
  return isWorkingDayIndex(dayIndex(date.getTime() + LIBREVILLE_OFFSET_MS), holidays);
}

/** Working time elapsed between two instants, in days (a working day counts
 *  24 h, weekends and holidays count 0). Fractional; 0 if end <= start. */
export function workingDaysBetween(start: Date, end: Date, holidays: PublicHolidays): number {
  const startMs = start.getTime() + LIBREVILLE_OFFSET_MS;
  const endMs = end.getTime() + LIBREVILLE_OFFSET_MS;
  if (!(endMs > startMs)) return 0;

  let workingMs = 0;
  for (let index = dayIndex(startMs); index <= dayIndex(endMs); index++) {
    if (!isWorkingDayIndex(index, holidays)) continue;
    const overlap = Math.min(endMs, (index + 1) * DAY_MS) - Math.max(startMs, index * DAY_MS);
    if (overlap > 0) workingMs += overlap;
  }
  return workingMs / DAY_MS;
}

/** The instant `days` working days before `end`: exactly the cutoff such that
 *  anything strictly earlier has more than `days` working days elapsed
 *  (consistent with workingDaysBetween). */
export function subtractWorkingDays(end: Date, days: number, holidays: PublicHolidays): Date {
  let remaining = days * DAY_MS;
  let cursor = end.getTime() + LIBREVILLE_OFFSET_MS;
  // Safety net: a holiday list covering every weekday cannot loop forever.
  for (let guard = 0; guard < 20_000 && remaining > 0; guard++) {
    const index = dayIndex(cursor - 1);
    const dayStart = index * DAY_MS;
    if (isWorkingDayIndex(index, holidays)) {
      const available = cursor - dayStart;
      if (available >= remaining) {
        cursor -= remaining;
        remaining = 0;
        break;
      }
      remaining -= available;
    }
    cursor = dayStart;
  }
  return new Date(cursor - LIBREVILLE_OFFSET_MS);
}
