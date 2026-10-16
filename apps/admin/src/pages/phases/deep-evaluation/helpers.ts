import { expectsDocumentCorrection } from '@aidn/shared';
import type { ChecklistItem, DeepEvaluationBundle } from './types';
import type { PhaseWorkflowSummaryState } from '../components/workflow-state';
import { APPLICANT_OWNER, DN_OWNER, FINANCE_OWNER, paymentPendingState } from '../owners';

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
      state: 'done',
      owner: DN_OWNER,
      phaseStatus,
      metrics: [
        { label: 'Paiement', value: paymentLabel },
        { label: 'Documents', value: evaluationLabel },
        { label: 'À corriger', value: String(bundle.completionRate.needsAction) },
      ],
    };
  }

  const metrics = [
    { label: 'Paiement', value: paymentLabel },
    { label: 'Documents', value: evaluationLabel },
    { label: 'À corriger', value: String(bundle.completionRate.needsAction) },
  ];

  // Open phase: same order as the Demandes cockpit (apps/api/src/modules/
  // requests/cockpit-next-action.ts, D9). 0. DN parallel work first: the DN
  // never reads « en attente » while documents await its verdict.
  if (bundle.completionRate.pending > 0) {
    return {
      title: `Évaluer ${bundle.completionRate.pending} document(s)`,
      description: 'Des documents déposés ou redéposés attendent l’avis de la DN.',
      state: 'action_required',
      owner: DN_OWNER,
      phaseStatus,
      blockReason,
      metrics,
    };
  }

  // 1. Applicant expected: corrections.
  if (bundle.phase && expectsDocumentCorrection(bundle.phase, bundle.evaluations)) {
    return {
      title: 'Corrections attendues du postulant',
      description: `${bundle.completionRate.needsAction} document(s) à corriger par le postulant.`,
      state: 'waiting',
      owner: APPLICANT_OWNER,
      phaseStatus,
      blockReason,
      metrics,
    };
  }

  // 2. Payment (applicant proof / Finance).
  if (!bundle.payment?.invoiceFileUrl) {
    return {
      title: 'Facture à envoyer',
      description: 'Envoyer la facture au postulant avant la validation du paiement.',
      state: 'action_required',
      owner: FINANCE_OWNER,
      phaseStatus,
      blockReason,
      metrics,
    };
  }

  if (bundle.payment.status !== 'validated') {
    return {
      ...paymentPendingState(bundle.payment, 'Valider la preuve de paiement ou demander une nouvelle preuve.'),
      phaseStatus,
      blockReason,
      metrics,
    };
  }

  // 3. The DN works the phase.
  if (bundle.completionRate.validated < bundle.completionRate.total) {
    return {
      title: 'Évaluation documentaire à terminer',
      description: 'Tous les documents doivent être validés avant la clôture de cette phase.',
      state: 'action_required',
      owner: DN_OWNER,
      phaseStatus,
      blockReason,
      metrics,
    };
  }

  return {
    title: 'Phase prête à clôturer',
    description: 'Le paiement est validé et tous les documents ont été validés.',
    state: 'action_required',
    owner: DN_OWNER,
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
