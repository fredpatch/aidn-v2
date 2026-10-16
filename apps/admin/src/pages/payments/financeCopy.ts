/** SESSION1-COCKPIT-1 - Finance cockpit French, keyed by the API's keys (D13).
 *  D8: « preuve de paiement » everywhere visible; no « quittance », no « S5 ». */
import type { FinanceBucket } from '@aidn/shared';
import type { FinanceQueueItem } from '../../lib/api/payments.types';
import type { CockpitMetric } from '../../components/cockpit/CockpitMetrics';
import type { QueueMode } from '../../lib/cockpit/queue';

export type FinanceTab = Exclude<FinanceBucket, 'inactive'> | 'all';
export const FINANCE_TABS: Array<{ key: FinanceTab; label: string }> = [
  { key: 'invoice_to_send', label: 'Factures à transmettre' },
  { key: 'proof_to_validate', label: 'Preuves à valider' },
  { key: 'awaiting_applicant', label: 'En attente du postulant' },
  { key: 'done', label: 'Traités' },
  { key: 'all', label: 'Tous' },
];
/** The applicant's turn is « En attente », never « À traiter ». */
export const FINANCE_TAB_MODES: Record<FinanceTab, QueueMode> = {
  invoice_to_send: 'action',
  proof_to_validate: 'action',
  awaiting_applicant: 'waiting',
  done: 'history',
  all: 'history',
};
export const PHASE_LABELS: Record<FinanceQueueItem['phaseCode'], string> = {
  M5: 'Évaluation approfondie',
  M6: 'Démonstration / Inspection',
  M7: 'Délivrance',
};

export function financeCallout(item: FinanceQueueItem): { title: string; description: string; blockReason: string | null } {
  if (item.payment.status === 'rejected') {
    return { title: 'Dossier rejeté — paiement clos', description: 'Le paiement et ses pièces restent consultables.', blockReason: null };
  }
  if (item.blockReason === 'dossier_closed') {
    return {
      title: 'Dossier clos — consultation uniquement',
      description: 'Le paiement et ses pièces restent consultables. Aucune action Finance n’est possible.',
      blockReason: null,
    };
  }
  switch (item.actionKey) {
    case 'send_invoice':
      return {
        title: 'Facture à transmettre',
        description: 'Joignez la facture transmise au postulant : la preuve de paiement sera ensuite attendue.',
        blockReason: null,
      };
    case 'validate_payment_proof':
      return {
        title: 'Preuve de paiement à valider',
        description: 'Contrôlez la preuve de paiement du postulant avant de débloquer la phase.',
        blockReason: null,
      };
    case 'await_payment_proof':
      return {
        title: 'En attente du postulant',
        description:
          item.newProofRequested && item.payment.rejectionReason
            ? `La facture a été transmise. Nouvelle preuve de paiement demandée : ${item.payment.rejectionReason}`
            : 'La facture a été transmise. La preuve de paiement est attendue.',
        blockReason: null,
      };
    default:
      return { title: 'Paiement validé', description: 'Le paiement ne requiert plus d’action Finance.', blockReason: null };
  }
}

const DAY_MS = 86_400_000;

/** Action buckets only (counts.inactive is never shown); « validés (30 j) »
 *  counts the validations present in the rows. */
export function financeMetrics(items: FinanceQueueItem[], counts: Record<FinanceBucket, number>, now: Date = new Date()): CockpitMetric[] {
  const late = (bucket: FinanceBucket) => items.filter((i) => i.bucket === bucket && i.urgency === 'overdue').length;
  const lateDetail = (n: number) => (n > 0 ? `dont ${n} en retard` : null);
  const newProof = items.filter((i) => i.bucket === 'awaiting_applicant' && i.newProofRequested).length;
  const validated30 = items.filter(
    (i) => i.payment.validatedAt && now.getTime() - new Date(i.payment.validatedAt).getTime() <= 30 * DAY_MS
  ).length;
  return [
    { key: 'invoice_to_send', label: 'factures à transmettre', value: counts.invoice_to_send, detail: lateDetail(late('invoice_to_send')), tone: 'info' },
    { key: 'proof_to_validate', label: 'preuves à valider', value: counts.proof_to_validate, detail: lateDetail(late('proof_to_validate')), tone: 'warning' },
    {
      key: 'awaiting_applicant',
      label: 'en attente du postulant',
      value: counts.awaiting_applicant,
      detail: newProof > 0 ? `dont ${newProof} nouvelle preuve demandée` : null,
      tone: 'neutral',
    },
    { key: 'validated_30', label: 'validés (30 j)', value: validated30, detail: null, tone: 'success' },
  ];
}
