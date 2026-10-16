/** SESSION1-COCKPIT-1 - Circuit Directeur DN cockpit French, keyed by the
 *  API's keys (D13). Urgency is always normal here (D10): the wait at the
 *  Directeur DN is informational only. */
import type { DnCircuitBucket } from '@aidn/shared';
import type { DnAnnotationTask } from '../../lib/api/dn-annotation';
import type { CockpitMetric } from '../../components/cockpit/CockpitMetrics';
import type { QueueMode } from '../../lib/cockpit/queue';

export type DnCircuitTab = Exclude<DnCircuitBucket, 'inactive'> | 'all';
export const DN_CIRCUIT_TABS: Array<{ key: DnCircuitTab; label: string }> = [
  { key: 'to_send', label: 'À transmettre' },
  { key: 'with_director', label: 'Chez le Directeur DN' },
  { key: 'returned', label: 'Transmis à la DN' },
  { key: 'all', label: 'Tous' },
];
/** with_director waits on the Directeur DN (« En attente »), it is not « À traiter ». */
export const DN_CIRCUIT_TAB_MODES: Record<DnCircuitTab, QueueMode> = {
  to_send: 'action',
  with_director: 'waiting',
  returned: 'history',
  all: 'history',
};

export function dnCircuitCallout(item: DnAnnotationTask): { title: string; description: string; blockReason: string | null } {
  if (item.blockReason === 'dossier_closed') {
    return { title: 'Dossier clos — consultation uniquement', description: 'Le circuit reste consultable. Aucune action n’est possible.', blockReason: null };
  }
  if (item.actionKey === 'send_to_director') {
    return { title: 'À transmettre au Directeur DN', description: 'Annotation du DG reçue. Remettez le dossier au Directeur DN, puis marquez-le transmis.', blockReason: null };
  }
  if (item.actionKey === 'record_director_annotation') {
    const since = item.directorWorkingDays === null ? '' : ` depuis ${item.directorWorkingDays} j ouvrés`;
    return { title: 'Chez le Directeur DN', description: `Le dossier est chez le Directeur DN${since}. Téléversez le retour annoté dès réception.`, blockReason: null };
  }
  if (item.actionKey === 'handed_to_dn') {
    return { title: 'Transmis à la DN', description: 'Annotation du Directeur DN reçue. La DN peut ouvrir la phase préliminaire.', blockReason: null };
  }
  return { title: 'Circuit archivé', description: 'Consultation uniquement.', blockReason: null };
}

const DAY_MS = 86_400_000;

export function dnCircuitMetrics(items: DnAnnotationTask[], counts: Record<DnCircuitBucket, number>, now: Date = new Date()): CockpitMetric[] {
  const waits = items.filter((i) => i.bucket === 'with_director' && i.directorWorkingDays !== null).map((i) => i.directorWorkingDays!);
  const average = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null;
  const handed30 = items.filter((i) => i.bucket === 'returned' && i.returnedAt && now.getTime() - new Date(i.returnedAt).getTime() <= 30 * DAY_MS).length;
  return [
    { key: 'to_send', label: 'à transmettre', value: counts.to_send, detail: null, tone: 'info' },
    {
      key: 'with_director',
      label: 'chez le Directeur DN',
      value: counts.with_director,
      detail: average === null ? null : `délai moyen ${average.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j ouvrés`,
      tone: 'warning',
    },
    { key: 'returned_30', label: 'transmis à la DN (30 j)', value: handed30, detail: null, tone: 'success' },
  ];
}
