import type { ChecklistItem, DeepEvaluationBundle } from './types';

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

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('fr-FR');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}
