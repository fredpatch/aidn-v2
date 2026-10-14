/**
 * SESSION1-M1-1 - Circuit Directeur DN: tab rules and search, pure functions
 * (same spirit as courrierBuckets.ts, kept separate so the Réception courrier
 * page carries no Assistante DN branch).
 */
import type { DnAnnotationBucket, DnAnnotationTask } from '../../lib/api/dn-annotation';

export const DN_ANNOTATION_TABS: Array<{ key: DnAnnotationBucket; label: string }> = [
  { key: 'to_send', label: 'À transmettre' },
  { key: 'with_director', label: 'En attente du retour' },
  { key: 'returned', label: 'Annotation reçue' },
];

/** K7d - a pending task on a closed dossier needs no action: it leaves the pending tabs. */
export function inDnTab(task: DnAnnotationTask, tab: DnAnnotationBucket): boolean {
  if (task.bucket !== tab) return false;
  return !(task.dossierClosed && tab !== 'returned');
}

export function countDnTabs(tasks: DnAnnotationTask[]): Record<DnAnnotationBucket, number> {
  const counts: Record<DnAnnotationBucket, number> = { to_send: 0, with_director: 0, returned: 0 };
  for (const task of tasks) {
    for (const tab of DN_ANNOTATION_TABS) if (inDnTab(task, tab.key)) counts[tab.key] += 1;
  }
  return counts;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filterDnTasks(tasks: DnAnnotationTask[], tab: DnAnnotationBucket, search: string): DnAnnotationTask[] {
  const needle = normalize(search.trim());
  return tasks
    .filter((task) => inDnTab(task, tab))
    .filter(
      (task) =>
        !needle ||
        normalize([task.requestReference, task.organisationName, task.applicantName, task.requestType].join(' ')).includes(needle)
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** What the reading pane offers: a state change is never fired by a key press. */
export function dnActionLabel(task: DnAnnotationTask): string | null {
  if (task.availableActions.includes('send_to_director')) return 'Marquer en circuit Directeur DN';
  if (task.availableActions.includes('upload_annotated_return')) return 'Téléverser le retour annoté';
  return null;
}
