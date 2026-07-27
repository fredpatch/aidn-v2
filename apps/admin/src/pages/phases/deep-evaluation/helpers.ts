import type { ChecklistItem, DeepEvaluationBundle } from './types';
import type { PhaseWorkflowSummaryState } from '../components/PhaseWorkflowSummary';

export function buildChecklist(bundle: DeepEvaluationBundle): ChecklistItem[] {
  const { completionRate, payment } = bundle;
  return [
    {
      label: 'Facture envoyée au postulant',
      done: !!payment?.invoiceFileUrl,
    },
    {
      label: 'Preuve de paiement soumise',
      done: !!payment?.proofFileUrl,
    },
    {
      label: 'Paiement validé',
      done: payment?.status === 'validated',
    },
    {
      label: `Documents évalués (${completionRate.validated}/${completionRate.total} validés)`,
      done: completionRate.total > 0 && completionRate.validated === completionRate.total,
    },
    {
      label: 'Phase clôturée',
      done: bundle.phase?.status === 'closed',
    },
  ];
}

export function canCloseDeepEvaluation(bundle: DeepEvaluationBundle | null): boolean {
  if (!bundle) return false;
  return (
    bundle.payment?.status === 'validated' &&
    bundle.completionRate.total > 0 &&
    bundle.completionRate.validated === bundle.completionRate.total
  );
}

export function closureBlockReason(bundle: DeepEvaluationBundle | null): string | null {
  if (!bundle) return null;
  if (bundle.payment?.status !== 'validated') {
    return 'Le paiement doit être validé avant de clôturer la phase.';
  }
  if (bundle.completionRate.validated < bundle.completionRate.total) {
    return `Tous les documents doivent être validés (${bundle.completionRate.validated}/${bundle.completionRate.total} actuellement).`;
  }
  return null;
}

export function deepEvaluationWorkflowSummary(
  bundle: DeepEvaluationBundle,
  blockReason: string | null
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
  const evaluationLabel = `${bundle.completionRate.validated}/${bundle.completionRate.total} validés`;

  if (phaseStatus === 'closed') {
    return {
      title: 'Phase clôturée',
      description: 'Cette phase est en consultation seule. Les décisions documentaires restent disponibles pour audit.',
      owner: 'DN',
      tone: 'muted',
      phaseStatus,
      metrics: [
        { label: 'Paiement', value: paymentLabel },
        { label: 'Documents', value: evaluationLabel },
        { label: 'À corriger', value: String(bundle.completionRate.needsAction) },
      ],
    };
  }

  if (!bundle.payment?.invoiceFileUrl) {
    return {
      title: 'Facture à envoyer',
      description: 'Envoyer la facture au postulant avant la validation du paiement.',
      owner: 'DN',
      tone: 'warning',
      phaseStatus,
      blockReason,
      metrics: [
        { label: 'Paiement', value: paymentLabel },
        { label: 'Documents', value: evaluationLabel },
        { label: 'À corriger', value: String(bundle.completionRate.needsAction) },
      ],
    };
  }

  if (bundle.payment.status !== 'validated') {
    return {
      title: 'Paiement à valider',
      description: 'Valider la preuve de paiement ou demander une nouvelle preuve.',
      owner: 'DN',
      tone: 'warning',
      phaseStatus,
      blockReason,
      metrics: [
        { label: 'Paiement', value: paymentLabel },
        { label: 'Documents', value: evaluationLabel },
        { label: 'À corriger', value: String(bundle.completionRate.needsAction) },
      ],
    };
  }

  if (bundle.completionRate.validated < bundle.completionRate.total) {
    return {
      title: 'Évaluation documentaire à terminer',
      description: 'Tous les documents doivent être validés avant la clôture de cette phase.',
      owner: 'DN',
      tone: 'warning',
      phaseStatus,
      blockReason,
      metrics: [
        { label: 'Paiement', value: paymentLabel },
        { label: 'Documents', value: evaluationLabel },
        { label: 'À corriger', value: String(bundle.completionRate.needsAction) },
      ],
    };
  }

  return {
    title: 'Phase prête à clôturer',
    description: 'Le paiement est validé et tous les documents ont été validés.',
    owner: 'DN',
    tone: 'success',
    phaseStatus,
    metrics: [
      { label: 'Paiement', value: paymentLabel },
      { label: 'Documents', value: evaluationLabel },
      { label: 'À corriger', value: '0' },
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
