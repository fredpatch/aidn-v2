import type { ChecklistItem, FormalPhaseBundle } from './types';

export function buildChecklist(bundle: FormalPhaseBundle): ChecklistItem[] {
  const allDocsSubmitted = bundle.completionRate === 11;
  return [
    {
      label: 'Lettre de demande officielle soumise',
      done: !!bundle.letterCircuit,
    },
    {
      label: 'Lettre transmise à la DN (circuit DG)',
      done: bundle.letterCircuit?.status === 'pending_review',
    },
    {
      label: `Documents soumis (${bundle.completionRate}/11)`,
      done: allDocsSubmitted,
    },
    {
      label: 'Réunion formelle planifiée',
      done: !!bundle.meeting,
    },
    {
      label: 'Réunion formelle tenue ou absence constatée',
      done: !!bundle.meeting && bundle.meeting.status !== 'scheduled',
    },
    {
      label: 'Compte-rendu envoyé',
      done: !!bundle.meeting?.crDocumentUrl,
      optional: true,
    },
    {
      label: 'Phase clôturée',
      done: bundle.phase?.status === 'closed',
    },
  ];
}

export function canCloseFormalPhase(bundle: FormalPhaseBundle | null): boolean {
  if (!bundle) return false;
  return (
    bundle.letterCircuit?.status === 'pending_review' &&
    bundle.completionRate === 11 &&
    !!bundle.meeting &&
    bundle.meeting.status !== 'scheduled'
  );
}

export function closureBlockReason(bundle: FormalPhaseBundle | null): string | null {
  if (!bundle) return null;
  if (bundle.letterCircuit?.status !== 'pending_review') {
    return "La lettre de demande formelle doit d'abord être transmise à la DN via le circuit DG.";
  }
  if (bundle.completionRate < 11) {
    return `Les 11 documents doivent tous être soumis (${bundle.completionRate}/11 actuellement).`;
  }
  if (!bundle.meeting || bundle.meeting.status === 'scheduled') {
    return "La réunion formelle doit d'abord être résolue (tenue, absence, ou dossier annulé).";
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
