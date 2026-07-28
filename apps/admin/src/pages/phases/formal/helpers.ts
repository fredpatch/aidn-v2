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
      label: 'Circuit signature - lettre transmise a la DN',
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
  return (
    bundle.letterCircuit?.status === 'pending_review' &&
    bundle.completionRate === 11 &&
    !!bundle.meeting &&
    bundle.meeting.status !== 'scheduled'
  );
}

export function closureBlockReason(bundle: FormalPhaseBundle | null): string | null {
  if (!bundle) return null;
  if (!bundle.letterCircuit) {
    return 'En attente de la lettre de demande officielle du postulant.';
  }
  if (bundle.letterCircuit.status === 'submitted') {
    return 'La lettre de demande officielle doit etre signee avant transmission a la DN.';
  }
  if (bundle.letterCircuit.status === 'signed') {
    return 'La lettre signee doit etre transmise a la DN avant la cloture.';
  }
  if (bundle.letterCircuit.status !== 'pending_review') {
    return 'Le circuit signature de la lettre doit etre finalise avant la cloture.';
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

export interface FormalNextAction {
  title: string;
  description: string;
  owner: string;
  tone: 'info' | 'warning' | 'success' | 'muted';
}

export function formalNextAction(bundle: FormalPhaseBundle | null): FormalNextAction {
  if (!bundle?.phase) {
    return {
      title: 'Démarrer la phase',
      description: 'La demande formelle peut être ouverte après la clôture de la phase préliminaire.',
      owner: 'DN',
      tone: 'info',
    };
  }

  if (bundle.phase.status === 'closed') {
    return {
      title: 'Phase clôturée',
      description: 'Cette phase est en consultation seule. Les pièces restent disponibles pour audit.',
      owner: 'DN',
      tone: 'muted',
    };
  }

  if (!bundle.letterCircuit) {
    return {
      title: 'Lettre officielle attendue',
      description: 'Deposer la lettre de demande officielle avant de poursuivre le circuit signature.',
      owner: 'DN',
      tone: 'warning',
    };
  }

  if (bundle.letterCircuit.status === 'submitted') {
    return {
      title: 'Signature requise',
      description: 'Marquer la lettre comme signee avec le document de circuit disponible.',
      owner: 'Signature',
      tone: 'warning',
    };
  }

  if (bundle.letterCircuit.status === 'signed') {
    return {
      title: 'Transmission à la DN requise',
      description: 'Transmettre la lettre signée à la Direction de la Navigabilité.',
      owner: 'DN',
      tone: 'warning',
    };
  }

  if (bundle.completionRate < 11) {
    return {
      title: 'Documents obligatoires manquants',
      description: `${bundle.completionRate}/11 documents déposés. Tous les documents obligatoires doivent être déposés.`,
      owner: 'DN',
      tone: 'warning',
    };
  }

  if (!bundle.meeting) {
    return {
      title: 'Réunion formelle à planifier',
      description: 'Planifier la réunion formelle. Le compte-rendu reste facultatif pour la clôture.',
      owner: 'DN',
      tone: 'info',
    };
  }

  if (bundle.meeting.status === 'scheduled') {
    return {
      title: 'Réunion formelle à résoudre',
      description: 'Marquer la réunion comme tenue, absence constatée, reprogrammée ou dossier annulé.',
      owner: 'DN',
      tone: 'info',
    };
  }

  return {
    title: 'Phase prête à clôturer',
    description: 'Les conditions obligatoires sont satisfaites. Le compte-rendu peut être ajouté, mais il est facultatif.',
    owner: 'DN',
    tone: 'success',
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
