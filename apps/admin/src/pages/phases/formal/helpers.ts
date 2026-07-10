import type { ChecklistItem, FormalPhaseBundle } from './types';

export function buildChecklist(bundle: FormalPhaseBundle): ChecklistItem[] {
  const allDocsSubmitted = bundle.completionRate === 11;
  const letterTransmitted = bundle.letterCircuit?.status === 'pending_review';
  const meetingResolved = !!bundle.meeting && bundle.meeting.status !== 'scheduled';

  return [
    {
      label: 'Lettre de demande officielle soumise',
      done: !!bundle.letterCircuit,
    },
    {
      label: 'Circuit DG — lettre transmise à la DN',
      done: letterTransmitted,
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
      done: meetingResolved,
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

/** Meeting can be scheduled as soon as the letter has been submitted
 *  (regardless of circuit status) — docs upload happens in parallel. */
export function canScheduleMeeting(bundle: FormalPhaseBundle | null): boolean {
  if (!bundle) return false;
  return !!bundle.letterCircuit;
}

/** Closure requires: all 11 docs submitted + meeting resolved.
 *  The letter circuit gate is also enforced server-side but we surface
 *  it in the UI only if it's the blocking reason. */
export function canCloseFormalPhase(bundle: FormalPhaseBundle | null): boolean {
  if (!bundle) return false;
  return bundle.completionRate === 11 && !!bundle.meeting && bundle.meeting.status !== 'scheduled';
}

export function closureBlockReason(bundle: FormalPhaseBundle | null): string | null {
  if (!bundle) return null;
  if (!bundle.letterCircuit) {
    return 'En attente de la lettre de demande officielle du postulant.';
  }
  if (bundle.completionRate < 11 && (!bundle.meeting || bundle.meeting.status === 'scheduled')) {
    return `Les 11 documents doivent être soumis (${bundle.completionRate}/11) et la réunion formelle doit être résolue.`;
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
