/**
 * C2a - Calendar day grouping shared by the two-pane lists (Demandes,
 * Courriers): Outlook-style group headers and the right-hand row date.
 * Pure functions, no React.
 */

export type DayGroupKey = 'today' | 'yesterday' | 'week' | 'older';

export const DAY_GROUP_LABELS: Record<DayGroupKey, string> = {
  today: "Aujourd'hui",
  yesterday: 'Hier',
  week: 'Cette semaine',
  older: 'Plus ancien',
};

export interface DayGroup<T> {
  key: DayGroupKey | 'flat';
  label: string | null;
  items: T[];
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Calendar grouping on the local day, Outlook style. The week starts on
 *  Monday; a date in the future (clock skew) counts as today. */
export function dayGroupOf(dateIso: string, now: Date = new Date()): DayGroupKey {
  const day = startOfDay(new Date(dateIso)).getTime();
  const today = startOfDay(now);
  if (day >= today.getTime()) return 'today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (day >= yesterday.getTime()) return 'yesterday';
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  if (day >= weekStart.getTime()) return 'week';
  return 'older';
}

/**
 * Groups an already sorted list by day, keeping the sort order: a new header
 * starts each time the day group changes (oldest-first lists get their groups
 * in reverse, as expected).
 */
export function groupByDay<T>(
  items: T[],
  getDate: (item: T) => string,
  now: Date = new Date()
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const key = dayGroupOf(getDate(item), now);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: DAY_GROUP_LABELS[key], items: [item] });
  }
  return groups;
}

/** One header-less group: a list not sorted by date. */
export function flatGroup<T>(items: T[]): DayGroup<T>[] {
  return items.length === 0 ? [] : [{ key: 'flat', label: null, items }];
}

/** Right-hand date of a row: time today, « Hier », weekday this week, else the date. */
export function formatRowDate(dateIso: string, now: Date = new Date()): string {
  const date = new Date(dateIso);
  const group = dayGroupOf(dateIso, now);
  if (group === 'today') {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  if (group === 'yesterday') return 'Hier';
  if (group === 'week') return date.toLocaleDateString('fr-FR', { weekday: 'short' });
  return date.toLocaleDateString('fr-FR');
}

/** Accent- and case-insensitive search key. */
export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
