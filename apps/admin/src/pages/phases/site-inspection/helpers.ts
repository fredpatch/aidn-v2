import type { ChecklistItem, SiteInspectionBundle } from './types';
import type { PhaseWorkflowSummaryState } from '../components/PhaseWorkflowSummary';

export function buildChecklist(bundle: SiteInspectionBundle): ChecklistItem[] {
  const { payment, siteVisit, inspection } = bundle;
  return [
    { label: 'Facture envoyée au postulant', done: !!payment?.invoiceFileUrl },
    { label: 'Preuve de paiement soumise', done: !!payment?.proofFileUrl },
    { label: 'Paiement validé', done: payment?.status === 'validated' },
    { label: 'Visite sur site planifiée', done: !!siteVisit },
    { label: 'Visite sur site tenue', done: siteVisit?.status === 'held' },
    { label: 'Avis d’inspection soumis', done: !!inspection },
    { label: 'Phase clôturée', done: bundle.phase?.status === 'closed' },
  ];
}

export function siteInspectionWorkflowSummary(
  bundle: SiteInspectionBundle
): PhaseWorkflowSummaryState {
  const phaseStatus = bundle.phase?.status ?? 'open';
  const paymentLabel =
    bundle.payment?.status === 'validated'
      ? 'Validé'
      : bundle.payment?.proofFileUrl
        ? 'À valider'
        : bundle.payment?.invoiceFileUrl
          ? 'Preuve attendue'
          : 'Facture attendue';
  const visitLabel = !bundle.siteVisit
    ? 'Non planifiée'
    : bundle.siteVisit.status === 'held'
      ? 'Tenue'
      : bundle.siteVisit.status === 'scheduled'
        ? 'Planifiée'
        : bundle.siteVisit.status;
  const verdictLabel = bundle.inspection ? 'Soumis' : 'Attendu';

  if (phaseStatus === 'closed') {
    return {
      title: 'Phase clôturée',
      description: 'Cette phase est en consultation seule. Le paiement, la visite et l’avis d’inspection restent auditables.',
      owner: 'DN / Cellule Inspection',
      tone: 'muted',
      phaseStatus,
      metrics: [
        { label: 'Paiement', value: paymentLabel },
        { label: 'Visite', value: visitLabel },
        { label: 'Avis d’inspection', value: verdictLabel },
      ],
    };
  }

  if (!bundle.payment?.invoiceFileUrl) {
    return {
      title: 'Facture à envoyer',
      description: 'Envoyer la facture avant d’attendre la preuve de paiement.',
      owner: 'DN',
      tone: 'warning',
      phaseStatus,
      blockReason: 'La visite ne doit pas être finalisée avant validation du paiement.',
      metrics: [
        { label: 'Paiement', value: paymentLabel },
        { label: 'Visite', value: visitLabel },
        { label: 'Avis d’inspection', value: verdictLabel },
      ],
    };
  }

  if (bundle.payment.status !== 'validated') {
    return {
      title: 'Paiement à valider',
      description: 'Valider la preuve de paiement avant l’avis final de l’inspection.',
      owner: 'DN',
      tone: 'warning',
      phaseStatus,
      blockReason: 'L’avis d’inspection ne peut pas finaliser la phase tant que le paiement n’est pas validé.',
      metrics: [
        { label: 'Paiement', value: paymentLabel },
        { label: 'Visite', value: visitLabel },
        { label: 'Avis d’inspection', value: verdictLabel },
      ],
    };
  }

  if (!bundle.siteVisit) {
    return {
      title: 'Visite sur site à planifier',
      description: 'Planifier la visite de démonstration et inspection sur site.',
      owner: 'DN',
      tone: 'info',
      phaseStatus,
      metrics: [
        { label: 'Paiement', value: paymentLabel },
        { label: 'Visite', value: visitLabel },
        { label: 'Avis d’inspection', value: verdictLabel },
      ],
    };
  }

  if (bundle.siteVisit.status !== 'held') {
    return {
      title: 'Visite sur site à résoudre',
      description: 'Marquer la visite comme tenue avant la saisie de l’avis d’inspection.',
      owner: 'DN',
      tone: 'info',
      phaseStatus,
      metrics: [
        { label: 'Paiement', value: paymentLabel },
        { label: 'Visite', value: visitLabel },
        { label: 'Avis d’inspection', value: verdictLabel },
      ],
    };
  }

  if (!bundle.inspection) {
    return {
      title: 'Avis d’inspection attendu',
      description: 'Saisir l’avis d’inspection après la visite tenue.',
      owner: 'Cellule Inspection',
      tone: 'warning',
      phaseStatus,
      metrics: [
        { label: 'Paiement', value: paymentLabel },
        { label: 'Visite', value: visitLabel },
        { label: 'Avis d’inspection', value: verdictLabel },
      ],
    };
  }

  return {
    title: 'Décision d’inspection enregistrée',
    description: 'L’avis d’inspection est soumis. La suite dépend du verdict enregistré.',
    owner: 'DN / Cellule Inspection',
    tone: 'success',
    phaseStatus,
    metrics: [
      { label: 'Paiement', value: paymentLabel },
      { label: 'Visite', value: visitLabel },
      { label: 'Avis d’inspection', value: verdictLabel },
    ],
  };
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('fr-FR');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}
