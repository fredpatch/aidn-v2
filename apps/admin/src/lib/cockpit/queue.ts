/** SESSION1-COCKPIT-1 §6 - queue order and grouping, pure. Action and waiting
 *  tabs: overdue, warning, normal, then step date (oldest first by default);
 *  a normal item is « À traiter » in an action tab and « En attente » in a
 *  waiting tab (approved correction). History tabs (done, inactive, « Tous »):
 *  step date, newest first by default. A null step date sorts last. */
import { URGENCY_RANK, type OperationalUrgency } from '@aidn/shared';
import { groupByDay, normalizeSearch, type DayGroup } from '../dayGroups';

export type AgeOrder = 'oldest' | 'newest';
export type QueueMode = 'action' | 'waiting' | 'history';
export interface QueueRow {
  id: string;
  urgency: OperationalUrgency;
  stepSince: string | null;
}

const URGENCY_GROUP_LABELS: Record<Exclude<QueueMode, 'history'>, Record<OperationalUrgency, string>> = {
  action: { overdue: 'En retard', warning: 'Échéance proche', normal: 'À traiter' },
  waiting: { overdue: 'En retard', warning: 'Échéance proche', normal: 'En attente' },
};

export function defaultOrderFor(mode: QueueMode): AgeOrder {
  return mode === 'history' ? 'newest' : 'oldest';
}

function compareDates(a: string | null, b: string | null, order: AgeOrder): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const diff = new Date(a).getTime() - new Date(b).getTime();
  return order === 'oldest' ? diff : -diff;
}

export function sortQueue<T extends QueueRow>(items: T[], mode: QueueMode, order: AgeOrder): T[] {
  return [...items].sort((a, b) => {
    if (mode !== 'history' && a.urgency !== b.urgency) return URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    return compareDates(a.stepSince, b.stepSince, order) || a.id.localeCompare(b.id);
  });
}

/** Groups an already sorted list: by urgency in action / waiting mode, by day in history. */
export function groupQueue<T extends QueueRow>(items: T[], mode: QueueMode, now: Date = new Date()): DayGroup<T>[] {
  if (mode === 'history') return groupByDay(items, (item) => item.stepSince ?? new Date(0).toISOString(), now);
  const labels = URGENCY_GROUP_LABELS[mode];
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.key === item.urgency) last.items.push(item);
    else groups.push({ key: item.urgency, label: labels[item.urgency], items: [item] });
  }
  return groups;
}

/** « all » keeps every row (inactive included); any other tab keeps its bucket. */
export function filterQueue<T extends QueueRow & { bucket: string }>(
  items: T[],
  tab: string,
  needle: string,
  haystack: (item: T) => string
): T[] {
  const search = normalizeSearch(needle);
  return items
    .filter((item) => tab === 'all' || item.bucket === tab)
    .filter((item) => !search || normalizeSearch(haystack(item)).includes(search));
}
