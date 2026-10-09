/**
 * D1 - Demandes cockpit: tab (bucket) rules, filtering, sorting and day
 * grouping. Pure functions, no React, so the business rules stay explicit
 * and unit-tested (requestBuckets.test.ts).
 */

import type { RequestCockpitItem } from '../../lib/api/requests.types';
import { flatGroup, groupByDay, normalizeSearch, type DayGroup } from '../../lib/dayGroups';

// C2a - day grouping moved to lib/dayGroups.ts (shared with Courriers);
// re-exported so existing imports keep working.
export {
  DAY_GROUP_LABELS,
  dayGroupOf,
  formatRowDate,
  normalizeSearch,
  type DayGroupKey,
} from '../../lib/dayGroups';

export type RequestBucket = 'all' | 'todo' | 'waiting_dg' | 'closed';
export type RequestSortKey = 'newest' | 'oldest' | 'reference';

/** Closed dossier (K7): only viewing and downloading remain possible. */
export const CLOSED_REQUEST_STATUSES = ['completed', 'rejected', 'cancelled'];

/** Physical DG signature circuit not finished: the DN follows read-only. */
export const WAITING_DG_CIRCUIT_STATUSES = ['submitted', 'in_signature_circuit', 'signed'];

export const REQUEST_BUCKETS: Array<{ key: RequestBucket; label: string }> = [
  { key: 'all', label: 'Toutes' },
  { key: 'todo', label: 'À traiter' },
  { key: 'waiting_dg', label: 'Attente DG' },
  { key: 'closed', label: 'Clôturées' },
];

export const REQUEST_SORT_OPTIONS: Array<{ key: RequestSortKey; label: string }> = [
  { key: 'newest', label: 'Date de dépôt (récentes)' },
  { key: 'oldest', label: 'Date de dépôt (anciennes)' },
  { key: 'reference', label: 'Référence' },
];

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

export type RequestDayGroup = DayGroup<RequestCockpitItem>;

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
  if (sort === 'reference') return flatGroup(items);
  return groupByDay(items, (item) => item.createdAt, now);
}

function dateMs(value: string): number {
  return new Date(value).getTime();
}
