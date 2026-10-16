/** SESSION1-COCKPIT-1 - Courriers cockpit French, keyed by the API's keys
 *  (D13). D7: « Annotation du DG » for the three reception circuits. */
import type { CourrierBucket } from '@aidn/shared';
import type { CourrierTask } from '../../lib/api/courrier-tasks';
import type { CockpitMetric } from '../../components/cockpit/CockpitMetrics';
import type { QueueMode } from '../../lib/cockpit/queue';

export type CourrierTab = Exclude<CourrierBucket, 'inactive'> | 'all';
export const COURRIER_TABS: Array<{ key: CourrierTab; label: string }> = [
  { key: 'to_print', label: 'À imprimer' },
  { key: 'with_dg', label: 'Retour DG attendu' },
  { key: 'returned', label: 'Retours enregistrés' },
  { key: 'all', label: 'Tous' },
];
/** Approved correction: with_dg waits on the DG (« En attente »), it is not « À traiter ». */
export const COURRIER_TAB_MODES: Record<CourrierTab, QueueMode> = { to_print: 'action', with_dg: 'waiting', returned: 'history', all: 'history' };

export const SOURCE_LABELS: Record<string, string> = {
  intake_request: 'Demande initiale',
  formal_request_letter: 'Lettre formelle',
  pre_evaluation: 'Déclaration de pré-évaluation',
};

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: 'Reconnaissance',
  issuance: 'Délivrance',
  modification: 'Modification',
  renewal: 'Renouvellement',
};

export const STEP_LABELS: Record<CourrierTask['circuitStep'], string> = {
  deposited: 'Déposé',
  with_dg: 'En circuit DG',
  returned: 'Annotation reçue',
  legacy_signed: 'Ancien circuit',
};

export interface CalloutCopy {
  title: string;
  description: string;
  blockReason: string | null;
}

export function courrierCallout(item: CourrierTask, t: { dgAlertWorkingDays: number }): CalloutCopy {
  if (item.blockReason === 'dossier_closed') {
    return {
      title: 'Dossier clos — consultation uniquement',
      description: 'Le courrier et son document restent consultables. Aucune action du circuit DG n’est possible.',
      blockReason: null,
    };
  }
  if (item.blockReason === 'phase_not_open') {
    return {
      title: 'Phase non ouverte',
      description: 'Le courrier attend l’ouverture de sa phase par la DN.',
      blockReason: `La phase ${item.source === 'pre_evaluation' ? 'M3' : 'M4'} n'est pas ouverte : aucune action du circuit possible.`,
    };
  }
  switch (item.actionKey) {
    case 'print_for_dg':
      return { title: 'Impression et mise en circuit DG', description: 'Imprimez le document puis confirmez sa mise en circuit DG.', blockReason: null };
    case 'record_dg_annotation': {
      const since = item.signatureWorkingDays === null ? '' : `En circuit DG depuis ${item.signatureWorkingDays} j ouvrés (alerte au-delà de ${t.dgAlertWorkingDays}). `;
      return { title: 'Annotation du DG attendue', description: `${since}Scannez le retour annoté dès réception.`, blockReason: null };
    }
    case 'handed_to_assistant_dn':
      return { title: 'Annotation du DG enregistrée', description: "Le dossier est transmis à l'Assistante DN pour le circuit Directeur DN.", blockReason: null };
    case 'handed_to_dn':
      return { title: 'Annotation du DG enregistrée', description: 'Le document est transmis à la DN.', blockReason: null };
    default:
      return { title: 'Ancien circuit', description: 'Courrier archivé, consultation uniquement.', blockReason: null };
  }
}

/** One-line label shown on the list row (state + who). */
export function courrierRowLabel(item: CourrierTask): string {
  if (item.blockReason === 'dossier_closed') return 'Dossier clos - consultation';
  if (item.blockReason === 'phase_not_open') return 'Phase non ouverte';
  if (item.actionKey === 'print_for_dg') return 'Imprimer puis mettre en circuit DG';
  if (item.actionKey === 'record_dg_annotation') return 'Annotation du DG attendue';
  if (item.actionKey === 'handed_to_assistant_dn') return "Transmis à l'Assistante DN";
  if (item.actionKey === 'handed_to_dn') return 'Transmis à la DN';
  return 'Ancien circuit';
}

const DAY_MS = 86_400_000;

export function courrierMetrics(items: CourrierTask[], counts: Record<CourrierBucket, number>, now: Date = new Date()): CockpitMetric[] {
  const late = (bucket: CourrierBucket) => items.filter((item) => item.bucket === bucket && item.urgency === 'overdue').length;
  const waits = items.filter((item) => item.bucket === 'with_dg' && item.signatureWorkingDays !== null).map((item) => item.signatureWorkingDays!);
  const average = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null;
  const returned30 = items.filter(
    (item) => item.bucket === 'returned' && item.pendingReviewAt && now.getTime() - new Date(item.pendingReviewAt).getTime() <= 30 * DAY_MS
  ).length;
  const lateDetail = (n: number) => (n > 0 ? `dont ${n} en retard` : null);
  const withDgDetail = [lateDetail(late('with_dg')), average === null ? null : `délai moyen ${average.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j ouvrés`]
    .filter(Boolean)
    .join(' · ');
  return [
    { key: 'to_print', label: 'à imprimer', value: counts.to_print, detail: lateDetail(late('to_print')), tone: 'info' },
    { key: 'with_dg', label: 'retour DG attendu', value: counts.with_dg, detail: withDgDetail || null, tone: 'warning' },
    { key: 'returned_30', label: 'retours enregistrés (30 j)', value: returned30, detail: null, tone: 'success' },
  ];
}
