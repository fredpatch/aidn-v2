import type { InspectionBucket } from '@aidn/shared';
import type { InspectionQueueItem } from '../../lib/api/site-inspection.types';
import type { CockpitMetric } from '../../components/cockpit/CockpitMetrics';
import type { QueueMode } from '../../lib/cockpit/queue';

export type InspectionTab = Exclude<InspectionBucket, 'inactive'> | 'all';
export const INSPECTION_TABS: Array<{ key: InspectionTab; label: string }> = [
  { key: 'to_hold', label: 'Visites à enregistrer' },
  { key: 'verdict_due', label: 'Avis à rendre' },
  { key: 'awaiting_payment', label: 'Paiement en attente' },
  { key: 'closed', label: 'Clôturées' },
  { key: 'all', label: 'Tous' },
];
export const INSPECTION_TAB_MODES: Record<InspectionTab, QueueMode> = {
  to_hold: 'action',
  verdict_due: 'action',
  awaiting_payment: 'waiting',
  closed: 'history',
  all: 'history',
};

export function inspectionCallout(item: InspectionQueueItem): { title: string; description: string; blockReason: string | null } {
  if (item.blockReason === 'dossier_closed') return { title: 'Dossier clos — consultation uniquement', description: 'La mission reste consultable. Aucune action de la Cellule Inspection n’est possible.', blockReason: null };
  switch (item.actionKey) {
    case 'await_payment':
      return { title: 'Paiement en attente', description: 'La visite peut être planifiée, mais pas enregistrée avant la validation du paiement.', blockReason: 'La visite pourra être enregistrée une fois le paiement validé par Finance.' };
    case 'record_visit_held':
      return { title: 'Visite à enregistrer', description: 'Enregistrez la tenue de la visite une fois celle-ci effectuée.', blockReason: null };
    case 'submit_verdict':
      return { title: "Avis d'inspection à rendre", description: "La visite est tenue. L'avis d'inspection doit être enregistré.", blockReason: null };
    default:
      return item.bucket === 'closed'
        ? { title: 'Mission clôturée', description: "L'avis d'inspection est enregistré.", blockReason: null }
        : { title: 'Visite non tenue', description: 'Consultation uniquement.', blockReason: null };
  }
}

export function inspectionMetrics(items: InspectionQueueItem[], counts: Record<InspectionBucket, number>): CockpitMetric[] {
  const past = items.filter((i) => i.bucket === 'to_hold' && i.urgency === 'overdue').length;
  return [
    { key: 'to_hold', label: 'visites à enregistrer', value: counts.to_hold, detail: past > 0 ? `dont ${past} passées` : null, tone: 'info' },
    { key: 'verdict_due', label: 'avis à rendre', value: counts.verdict_due, detail: null, tone: 'warning' },
    { key: 'awaiting_payment', label: 'paiement en attente', value: counts.awaiting_payment, detail: null, tone: 'neutral' },
  ];
}
