import { expectsFormalDocuments, type NextActionOwner, type OperationalState } from '@aidn/shared';
import type { ChecklistItem, FormalPhaseBundle } from './types';
import { APPLICANT_OWNER, ASSISTANT_DG_OWNER, DN_OWNER, RECEPTION_OWNER, scheduledMeetingState } from '../owners';

export function buildChecklist(bundle: FormalPhaseBundle): ChecklistItem[] {
  const allDocsSubmitted = bundle.completionRate === 11;
  const letterReturned = bundle.letterCircuit?.status === 'pending_review';
  const meetingResolved = !!bundle.meeting && bundle.meeting.status !== 'scheduled';

  return [
    { label: 'Lettre de demande officielle soumise', done: !!bundle.letterCircuit },
    { label: 'Retour signé scanné', done: letterReturned },
    { label: `Documents soumis (${bundle.completionRate}/11)`, done: allDocsSubmitted },
    { label: 'Réunion formelle planifiée', done: !!bundle.meeting },
    { label: 'Réunion formelle tenue ou absence constatée', done: meetingResolved },
    {
      label: 'Compte-rendu envoyé',
      done: !!bundle.meeting?.crDocumentUrl,
      optional: true,
    },
    { label: 'Phase clôturée', done: bundle.phase?.status === 'closed' },
  ];
}

export function canScheduleMeeting(bundle: FormalPhaseBundle | null): boolean {
  if (!bundle) return false;
  return bundle.phase?.status === 'open' && bundle.letterCircuit?.status === 'pending_review';
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
  if (!bundle.letterCircuit) {
    return 'En attente de la lettre de demande officielle du postulant.';
  }
  if (bundle.letterCircuit.status === 'submitted') {
    return 'La lettre de demande officielle doit être imprimée puis mise en signature par réception / assistant DG.';
  }
  if (bundle.letterCircuit.status === 'in_signature_circuit') {
    return 'La lettre de demande officielle est en signature. Le retour signé doit être scanné avant la clôture.';
  }
  if (bundle.letterCircuit.status === 'signed') {
    return 'Ancien statut intermédiaire : finalisez le retour signé depuis Courriers à traiter avant la clôture.';
  }
  if (bundle.letterCircuit.status !== 'pending_review') {
    return 'Le circuit signature de la lettre doit être finalisé avant la clôture.';
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
  state: OperationalState;
  owner: NextActionOwner;
}

export function formalNextAction(bundle: FormalPhaseBundle | null): FormalNextAction {
  if (!bundle?.phase) {
    return {
      title: 'Démarrer la phase',
      description: 'La demande formelle peut être ouverte après la clôture de la phase préliminaire.',
      state: 'action_required',
      owner: DN_OWNER,
    };
  }

  if (bundle.phase.status === 'closed') {
    return {
      title: 'Phase clôturée',
      description: 'Cette phase est en consultation seule. Les pièces restent disponibles pour audit.',
      state: 'done',
      owner: DN_OWNER,
    };
  }

  // Open phase: same order as the Demandes cockpit (apps/api/src/modules/
  // requests/cockpit-next-action.ts, D9): DN parallel work, then the
  // applicant, then the DG letter circuit, then the DN.
  const meetingScheduled = bundle.meeting?.status === 'scheduled';

  // 0. A counter-proposal awaits the DN: never shown as « en attente ».
  if (meetingScheduled && bundle.meeting!.negotiation.confirmationStatus === 'awaiting_dn') {
    return scheduledMeetingState(bundle.meeting!, 'formelle');
  }

  // 1. Applicant expected.
  if (!bundle.letterCircuit) {
    return {
      title: 'Lettre officielle attendue',
      description: 'Le postulant doit déposer la lettre de demande officielle depuis le portail.',
      state: 'waiting',
      owner: APPLICANT_OWNER,
    };
  }

  if (meetingScheduled && bundle.meeting!.negotiation.confirmationStatus === 'awaiting_applicant') {
    return scheduledMeetingState(bundle.meeting!, 'formelle');
  }

  if (expectsFormalDocuments(bundle.phase, bundle.documents)) {
    return {
      title: 'Pièces attendues du postulant',
      description: `${bundle.completionRate}/11 documents déposés. Tous les documents obligatoires doivent être déposés.`,
      state: 'waiting',
      owner: APPLICANT_OWNER,
    };
  }

  // 2. DG letter circuit.
  if (bundle.letterCircuit.status === 'submitted') {
    return {
      title: 'Mise en signature attendue',
      description: 'Réception / assistant DG imprime le courrier puis confirme sa mise en signature.',
      state: 'action_required',
      owner: RECEPTION_OWNER,
    };
  }

  if (bundle.letterCircuit.status === 'in_signature_circuit') {
    return {
      title: 'Retour signé attendu',
      description: 'Le courrier est en signature. Le scan du retour débloquera la réunion formelle.',
      state: 'waiting',
      owner: ASSISTANT_DG_OWNER,
    };
  }

  if (bundle.letterCircuit.status === 'signed') {
    return {
      title: 'Finalisation du retour attendue',
      description: 'Ancien statut intermédiaire : finaliser le retour signé depuis Courriers à traiter.',
      state: 'waiting',
      owner: ASSISTANT_DG_OWNER,
    };
  }

  // 3. The DN works the phase.
  if (!bundle.meeting) {
    return {
      title: 'Réunion formelle à planifier',
      description: 'Planifier la réunion formelle. Le compte-rendu reste facultatif pour la clôture.',
      state: 'action_required',
      owner: DN_OWNER,
    };
  }

  if (bundle.meeting.status === 'scheduled') {
    return scheduledMeetingState(bundle.meeting, 'formelle');
  }

  return {
    title: 'Phase prête à clôturer',
    description: 'Les conditions obligatoires sont satisfaites. Le compte-rendu peut être ajouté, mais il est facultatif.',
    state: 'action_required',
    owner: DN_OWNER,
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
