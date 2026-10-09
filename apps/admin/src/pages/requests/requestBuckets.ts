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

/** `unread` (D3c) is a view across the others, not an exclusive bucket. */
export type RequestBucket = 'all' | 'unread' | 'todo' | 'waiting_dg' | 'closed';
export type RequestSortKey = 'activity' | 'newest' | 'oldest' | 'reference';

/** Closed dossier (K7): only viewing and downloading remain possible. */
export const CLOSED_REQUEST_STATUSES = ['completed', 'rejected', 'cancelled'];

/** Physical DG signature circuit not finished: the DN follows read-only. */
export const WAITING_DG_CIRCUIT_STATUSES = ['submitted', 'in_signature_circuit', 'signed'];

export const REQUEST_BUCKETS: Array<{ key: RequestBucket; label: string }> = [
  { key: 'all', label: 'Toutes' },
  { key: 'unread', label: 'Non lues' },
  { key: 'todo', label: 'À traiter' },
  { key: 'waiting_dg', label: 'Attente DG' },
  { key: 'closed', label: 'Clôturées' },
];

export const REQUEST_SORT_OPTIONS: Array<{ key: RequestSortKey; label: string }> = [
  { key: 'activity', label: 'Dernière activité' },
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
): Exclude<RequestBucket, 'all' | 'unread'> {
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

/** D3c - the API never reports a closed dossier unread; checked again here. */
export function isUnreadRequest(item: Pick<RequestCockpitItem, 'status' | 'unread'>): boolean {
  return item.unread && !isClosedRequest(item);
}

export function inBucket(item: RequestCockpitItem, bucket: RequestBucket): boolean {
  if (bucket === 'all') return true;
  if (bucket === 'unread') return isUnreadRequest(item);
  return bucketOf(item) === bucket;
}

export function countBuckets(
  items: Array<Pick<RequestCockpitItem, 'status' | 'circuitStatus' | 'unread'>>
): Record<RequestBucket, number> {
  const counts: Record<RequestBucket, number> = {
    all: items.length,
    unread: 0,
    todo: 0,
    waiting_dg: 0,
    closed: 0,
  };
  for (const item of items) {
    counts[bucketOf(item)] += 1;
    if (isUnreadRequest(item)) counts.unread += 1;
  }
  return counts;
}

/**
 * D3c - flags shown on a row, derived only from what the cockpit already
 * returns (no new data): submitted documents awaiting review, and a signed
 * return that lets the DN open the preliminary phase. None on a closed dossier.
 */
export function requestFlags(
  item: Pick<RequestCockpitItem, 'status' | 'documentSummary' | 'canStartPreliminary'>
): string[] {
  if (isClosedRequest(item)) return [];
  const flags: string[] = [];
  const pending = item.documentSummary.pending;
  if (pending > 0) {
    flags.push(`${pending} document${pending > 1 ? 's' : ''} en attente de revue`);
  }
  if (item.canStartPreliminary) flags.push('Retour signé reçu : phase préliminaire à ouvrir');
  return flags;
}

/** Date a row is sorted, grouped and dated on. */
export function rowDateOf(item: RequestCockpitItem, sort: RequestSortKey): string {
  return sort === 'activity' ? item.lastActivityAt : item.createdAt;
}

export function filterRequests(
  items: RequestCockpitItem[],
  { bucket, search, sort }: { bucket: RequestBucket; search: string; sort: RequestSortKey }
): RequestCockpitItem[] {
  const needle = normalizeSearch(search);
  return items
    .filter((item) => inBucket(item, bucket))
    .filter(
      (item) =>
        !needle ||
        normalizeSearch(
          `${item.reference} ${item.organisationName} ${item.applicantName} ${item.requestTypeLabel} ${item.currentPhaseLabel}`
        ).includes(needle)
    )
    .sort((a, b) => {
      if (sort === 'activity') return dateMs(b.lastActivityAt) - dateMs(a.lastActivityAt);
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
  return groupByDay(items, (item) => rowDateOf(item, sort), now);
}

function dateMs(value: string): number {
  return new Date(value).getTime();
}
