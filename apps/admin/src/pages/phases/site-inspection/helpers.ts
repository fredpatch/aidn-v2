import type { ChecklistItem, SiteInspectionBundle } from './types';

export function buildChecklist(bundle: SiteInspectionBundle): ChecklistItem[] {
  const { payment, siteVisit, inspection } = bundle;
  return [
    { label: 'Facture envoyée au postulant', done: !!payment?.invoiceFileUrl },
    { label: 'Preuve de paiement soumise', done: !!payment?.proofFileUrl },
    { label: 'Paiement validé', done: payment?.status === 'validated' },
    { label: 'Visite sur site planifiée', done: !!siteVisit },
    { label: 'Visite sur site tenue', done: siteVisit?.status === 'held' },
    { label: 'Avis R3 soumis', done: !!inspection },
    { label: 'Phase clôturée', done: bundle.phase?.status === 'closed' },
  ];
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('fr-FR');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}
