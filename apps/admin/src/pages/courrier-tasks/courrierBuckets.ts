/**
 * C2b - Courriers à traiter, two panes: tab rules, search, sorting, the date
 * of the current circuit step and the next action. Pure functions, no React
 * (courrierBuckets.test.ts).
 *
 * The circuit itself is the API's (courrier-tasks.service.ts): `bucket` is
 * the circuit status, `availableActions` is empty on a closed dossier (K7c)
 * and every transition is checked again server-side.
 */
import type { CourrierTask, CourrierTaskBucket } from '../../lib/api/courrier-tasks';
import { groupByDay, normalizeSearch, type DayGroup } from '../../lib/dayGroups';

export type CourrierTab = 'to_signature' | 'in_signature' | 'returned' | 'all';
export type CourrierSortKey = 'oldest' | 'newest';

/** « Ancien signé » (legacy `signed` status) has no tab: history, under « Tous ». */
export const COURRIER_TABS: Array<{ key: CourrierTab; label: string }> = [
  { key: 'to_signature', label: 'À imprimer' },
  { key: 'in_signature', label: 'En signature' },
  { key: 'returned', label: 'Retours signés' },
  { key: 'all', label: 'Tous' },
];

export const COURRIER_SORT_OPTIONS: Array<{ key: CourrierSortKey; label: string }> = [
  { key: 'oldest', label: "Plus ancien d'abord" },
  { key: 'newest', label: "Plus récent d'abord" },
];

export const SOURCE_LABELS: Record<string, string> = {
  intake_request: 'Demande initiale',
  formal_request_letter: 'Lettre formelle',
  pre_evaluation: 'Déclaration de pré-évaluation',
};

export const BUCKET_LABELS: Record<CourrierTaskBucket, string> = {
  to_signature: 'À imprimer',
  in_signature: 'En signature',
  returned: 'Retour signé',
  legacy_signed: 'Ancien signé',
};

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: 'Reconnaissance',
  issuance: 'Délivrance',
  modification: 'Modification',
  renewal: 'Renouvellement',
};

/** Label of the current circuit step, used before its date. */
export const STEP_LABELS: Record<CourrierTaskBucket, string> = {
  to_signature: 'Déposé',
  in_signature: 'En signature',
  returned: 'Retour scanné',
  legacy_signed: 'Signé',
};

const ACTION_TABS: readonly CourrierTab[] = ['to_signature', 'in_signature'];

/**
 * K7d - same rule as the API counts: a courrier still to print or in
 * signature on a closed dossier needs no action, so it leaves those two tabs
 * and stays under « Tous ». Returned courriers keep their tab.
 */
export function inTab(task: CourrierTask, tab: CourrierTab): boolean {
  if (tab === 'all') return true;
  if (task.bucket !== tab) return false;
  // C2d - a pending courrier whose phase is not open: same treatment.
  const noAction = task.dossierClosed || task.actionBlockedReason === 'phase_not_open';
  return !(noAction && ACTION_TABS.includes(tab));
}

export function countTabs(tasks: CourrierTask[]): Record<CourrierTab, number> {
  const counts: Record<CourrierTab, number> = {
    to_signature: 0,
    in_signature: 0,
    returned: 0,
    all: tasks.length,
  };
  for (const task of tasks) {
    for (const tab of ['to_signature', 'in_signature', 'returned'] as const) {
      if (inTab(task, tab)) counts[tab] += 1;
    }
  }
  return counts;
}

/** Work queues are first in, first out; history reads newest first. */
export function defaultSortFor(tab: CourrierTab): CourrierSortKey {
  return ACTION_TABS.includes(tab) ? 'oldest' : 'newest';
}

/** Date the courrier reached its current step: what the list groups and sorts on. */
export function stepDateOf(task: CourrierTask): string {
  if (task.bucket === 'in_signature') return task.signatureSentAt ?? task.depositedAt;
  if (task.bucket === 'returned') return task.pendingReviewAt ?? task.signedAt ?? task.depositedAt;
  if (task.bucket === 'legacy_signed')
    return task.signedAt ?? task.pendingReviewAt ?? task.depositedAt;
  return task.depositedAt;
}

/** Whole working days in signature, computed by the API (Libreville time,
 *  public holidays excluded, same count as the Circuit DG alert). */
export function signatureWaitDays(task: CourrierTask): number | null {
  return task.bucket === 'in_signature' ? task.signatureWorkingDays : null;
}

/** C2c - the API applies the Circuit DG threshold (`dg_circuit_alert_days`);
 *  never flagged on a closed dossier (K7c: no action expected). */
export function isSignatureLate(task: CourrierTask): boolean {
  return !task.dossierClosed && task.signatureLate;
}

/** Mean wait of the open courriers in signature, e.g. « 3,5 j ouvrés » (null if none). */
export function averageSignatureWait(tasks: CourrierTask[]): string | null {
  const values = tasks
    .filter((task) => inTab(task, 'in_signature'))
    .map(signatureWaitDays)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `${avg.toLocaleString('fr-FR', { maximumFractionDigits: avg >= 10 ? 0 : 1 })} j ouvrés`;
}

/**
 * The one action the reading pane offers. Both change the circuit, so the
 * list's Entrée only focuses the button, and each still needs a confirmation
 * (the viewer's « Impression OK », the signed-return upload).
 * - print: to print then put in signature;
 * - return: in signature, the signed return is awaited;
 * - none: returned, history, closed dossier (K7c: viewing only), or a phase
 *   not open (C2c: the API sends no action, it would refuse it).
 * Driven by the API's `availableActions`, so the screen never offers what the
 * API refuses.
 */
export type CourrierActionKind = 'print' | 'return' | 'none';

export function courrierActionKind(task: CourrierTask): CourrierActionKind {
  if (task.dossierClosed) return 'none';
  if (task.bucket === 'to_signature' && task.availableActions.includes('print')) return 'print';
  if (task.bucket === 'in_signature' && task.availableActions.includes('upload_signed_return'))
    return 'return';
  return 'none';
}

/** C2c - pending in the circuit but its M3 / M4 phase is not open. */
export function isPhaseBlocked(task: CourrierTask): boolean {
  return !task.dossierClosed && task.actionBlockedReason === 'phase_not_open';
}

export function nextActionLabel(task: CourrierTask): string {
  if (task.dossierClosed) return 'Dossier clos - consultation';
  if (isPhaseBlocked(task)) return 'Phase non ouverte - aucune action';
  if (task.bucket === 'to_signature') return 'Imprimer puis mettre en signature';
  if (task.bucket === 'in_signature') {
    const days = signatureWaitDays(task);
    return days === null ? 'Retour DG attendu' : `Retour DG attendu · ${days} j ouvrés`;
  }
  if (task.bucket === 'returned') return 'Transmis à la DN';
  return 'Consultation historique';
}

export function filterCourriers(
  tasks: CourrierTask[],
  { tab, search, sort }: { tab: CourrierTab; search: string; sort: CourrierSortKey }
): CourrierTask[] {
  const needle = normalizeSearch(search);
  return tasks
    .filter((task) => inTab(task, tab))
    .filter(
      (task) =>
        !needle ||
        normalizeSearch(
          [
            task.requestReference,
            task.organisationName,
            task.applicantName,
            SOURCE_LABELS[task.source] ?? task.source,
            REQUEST_TYPE_LABELS[task.requestType] ?? task.requestType,
          ].join(' ')
        ).includes(needle)
    )
    .sort((a, b) => {
      const diff = dateMs(stepDateOf(a)) - dateMs(stepDateOf(b));
      return sort === 'oldest' ? diff : -diff;
    });
}

export function groupCourriersByDay(
  tasks: CourrierTask[],
  now: Date = new Date()
): DayGroup<CourrierTask>[] {
  return groupByDay(tasks, stepDateOf, now);
}

function dateMs(value: string): number {
  return new Date(value).getTime();
}
