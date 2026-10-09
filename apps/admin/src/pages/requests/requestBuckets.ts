import type { RequestCockpitItem } from '../../lib/api/requests.types';

/**
 * D1 - Demandes cockpit: tab (bucket) rules, filtering, sorting and day
 * grouping. Pure functions, no React, so the business rules stay explicit
 * and unit-tested (requestBuckets.test.ts).
 */

export type RequestBucket = 'all' | 'todo' | 'waiting_dg' | 'closed';
export type RequestSortKey = 'newest' | 'oldest' | 'reference';
export type DayGroupKey = 'today' | 'yesterday' | 'week' | 'older';

/** Closed dossier (K7): only viewing and downloading remain possible. */
export const CLOSED_REQUEST_STATUSES = ['completed', 'rejected', 'cancelled'];

/** Physical DG signature circuit not finished: the DN follows read-only. */
export const WAITING_DG_CIRCUIT_STATUSES = ['submitted', 'in_signature_circuit', 'signed'];

export const REQUEST_BUCKETS: Array<{ key: RequestBucket; label: string }> = [
  { key: 'all', label: 'Toutes' },
  { key: 'todo', label: 'À traiter' },
  { key: 'waiting_dg', label: 'En attente DG' },
  { key: 'closed', label: 'Clôturées' },
];

export const REQUEST_SORT_OPTIONS: Array<{ key: RequestSortKey; label: string }> = [
  { key: 'newest', label: 'Date de dépôt (récentes)' },
  { key: 'oldest', label: 'Date de dépôt (anciennes)' },
  { key: 'reference', label: 'Référence' },
];

export const DAY_GROUP_LABELS: Record<DayGroupKey, string> = {
  today: "Aujourd'hui",
  yesterday: 'Hier',
  week: 'Cette semaine',
  older: 'Plus ancien',
};

export function isClosedRequest(item: Pick<RequestCockpitItem, 'status'>): boolean {
  return CLOSED_REQUEST_STATUSES.includes(item.status);
}

/**
 * Each dossier belongs to exactly one bucket, by precedence:
 * 1. closed (completed, rejected, cancelled) - whatever its circuit status;
 * 2. waiting_dg (signature circuit not finished);
 * 3. todo - everything else, i.e. work the DN can act on or must check.
 */
export function bucketOf(
  item: Pick<RequestCockpitItem, 'status' | 'circuitStatus'>
): Exclude<RequestBucket, 'all'> {
  if (isClosedRequest(item)) return 'closed';
  if (WAITING_DG_CIRCUIT_STATUSES.includes(item.circuitStatus ?? '')) return 'waiting_dg';
  return 'todo';
}

/**
 * What the reading pane (and Entrée in the list) offers for a dossier:
 * - start: the signed return is in, the DN can open the preliminary phase
 *   (a state change, so it is never fired by a single key press);
 * - treat: an open workflow step, link to the phase page;
 * - consult: closed dossier with a page to view (K7: viewing only);
 * - readonly: nothing to do or open from here (DG circuit, closed with no page).
 */
export type NextActionKind = 'start' | 'treat' | 'consult' | 'readonly';

export function nextActionKind(
  item: Pick<RequestCockpitItem, 'status' | 'canStartPreliminary' | 'nextActionHref'>
): NextActionKind {
  if (isClosedRequest(item)) return item.nextActionHref ? 'consult' : 'readonly';
  if (item.canStartPreliminary) return 'start';
  if (item.nextActionHref) return 'treat';
  return 'readonly';
}

export function countBuckets(
  items: Array<Pick<RequestCockpitItem, 'status' | 'circuitStatus'>>
): Record<RequestBucket, number> {
  const counts: Record<RequestBucket, number> = {
    all: items.length,
    todo: 0,
    waiting_dg: 0,
    closed: 0,
  };
  for (const item of items) counts[bucketOf(item)] += 1;
  return counts;
}

export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function filterRequests(
  items: RequestCockpitItem[],
  { bucket, search, sort }: { bucket: RequestBucket; search: string; sort: RequestSortKey }
): RequestCockpitItem[] {
  const needle = normalizeSearch(search);
  return items
    .filter((item) => bucket === 'all' || bucketOf(item) === bucket)
    .filter(
      (item) =>
        !needle ||
        normalizeSearch(
          `${item.reference} ${item.organisationName} ${item.applicantName} ${item.requestTypeLabel} ${item.currentPhaseLabel}`
        ).includes(needle)
    )
    .sort((a, b) => {
      if (sort === 'oldest') return dateMs(a.createdAt) - dateMs(b.createdAt);
      if (sort === 'reference') return a.reference.localeCompare(b.reference);
      return dateMs(b.createdAt) - dateMs(a.createdAt);
    });
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

export interface RequestDayGroup {
  key: DayGroupKey | 'flat';
  label: string | null;
  items: RequestCockpitItem[];
}

/**
 * Groups an already sorted list by submission day, keeping the sort order.
 * Grouping only makes sense for a date sort: sorted by reference, the list
 * is one flat group with no header.
 */
export function groupRequestsByDay(
  items: RequestCockpitItem[],
  sort: RequestSortKey,
  now: Date = new Date()
): RequestDayGroup[] {
  if (items.length === 0) return [];
  if (sort === 'reference') return [{ key: 'flat', label: null, items }];
  const groups: RequestDayGroup[] = [];
  for (const item of items) {
    const key = dayGroupOf(item.createdAt, now);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: DAY_GROUP_LABELS[key], items: [item] });
  }
  return groups;
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

function dateMs(value: string): number {
  return new Date(value).getTime();
}
