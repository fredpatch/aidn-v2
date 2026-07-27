import type { ChecklistItem, CertificateBundle } from './types';

export function buildChecklist(bundle: CertificateBundle): ChecklistItem[] {
  const { payment, certificate } = bundle;
  return [
    { label: 'Facture envoyée au postulant', done: !!payment?.invoiceFileUrl },
    { label: 'Preuve de paiement soumise', done: !!payment?.proofFileUrl },
    { label: 'Paiement validé (certificat créé)', done: payment?.status === 'validated' },
    { label: 'Champs du certificat renseignés', done: !!certificate?.approvalReferenceNumber },
    { label: 'Document généré', done: (certificate?.status ?? 'in_preparation') !== 'in_preparation' },
    { label: 'Imprimé', done: !!certificate?.printedAt },
    { label: 'Signé', done: !!certificate?.signedAt },
    { label: 'Archivé', done: !!certificate?.archivedAt },
    { label: 'Postulant notifié', done: !!certificate?.notifiedAt },
    { label: 'Retiré par le postulant (phase clôturée)', done: !!certificate?.collectedAt },
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

/** yyyy-MM-dd for <input type="date"> from an ISO datetime string. */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}
