import type { ChecklistItem, FormalPhaseBundle } from './types';

export function buildChecklist(bundle: FormalPhaseBundle): ChecklistItem[] {
  const allDocsSubmitted = bundle.completionRate === 11;
  const letterReturned = bundle.letterCircuit?.status === 'pending_review';
  const meetingResolved = !!bundle.meeting && bundle.meeting.status !== 'scheduled';

  return [
    { label: 'Lettre de demande officielle soumise', done: !!bundle.letterCircuit },
    { label: 'Retour signe scanne', done: letterReturned },
    { label: `Documents soumis (${bundle.completionRate}/11)`, done: allDocsSubmitted },
    { label: 'Reunion formelle planifiee', done: !!bundle.meeting },
    { label: 'Reunion formelle tenue ou absence constatee', done: meetingResolved },
    {
      label: 'Compte-rendu envoye',
      done: !!bundle.meeting?.crDocumentUrl,
      optional: true,
    },
    { label: 'Phase cloturee', done: bundle.phase?.status === 'closed' },
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
    return 'La lettre de demande officielle doit etre imprimee puis mise en signature par reception / assistant DG.';
  }
  if (bundle.letterCircuit.status === 'in_signature_circuit') {
    return 'La lettre de demande officielle est en signature. Le retour signe doit etre scanne avant la cloture.';
  }
  if (bundle.letterCircuit.status === 'signed') {
    return 'Ancien statut intermediaire: finalisez le retour signe depuis Courriers a traiter avant la cloture.';
  }
  if (bundle.letterCircuit.status !== 'pending_review') {
    return 'Le circuit signature de la lettre doit etre finalise avant la cloture.';
  }
  if (bundle.completionRate < 11 && (!bundle.meeting || bundle.meeting.status === 'scheduled')) {
    return `Les 11 documents doivent etre soumis (${bundle.completionRate}/11) et la reunion formelle doit etre resolue.`;
  }
  if (bundle.completionRate < 11) {
    return `Les 11 documents doivent tous etre soumis (${bundle.completionRate}/11 actuellement).`;
  }
  if (!bundle.meeting || bundle.meeting.status === 'scheduled') {
    return "La reunion formelle doit d'abord etre resolue (tenue, absence, ou dossier annule).";
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
      title: 'Demarrer la phase',
      description: 'La demande formelle peut etre ouverte apres la cloture de la phase preliminaire.',
      owner: 'DN',
      tone: 'info',
    };
  }

  if (bundle.phase.status === 'closed') {
    return {
      title: 'Phase cloturee',
      description: 'Cette phase est en consultation seule. Les pieces restent disponibles pour audit.',
      owner: 'DN',
      tone: 'muted',
    };
  }

  if (!bundle.letterCircuit) {
    return {
      title: 'Lettre officielle attendue',
      description: 'Le postulant doit deposer la lettre de demande officielle depuis le portail.',
      owner: 'Postulant',
      tone: 'warning',
    };
  }

  if (bundle.letterCircuit.status === 'submitted') {
    return {
      title: 'Mise en signature attendue',
      description: 'Reception / assistant DG imprime le courrier puis confirme sa mise en signature.',
      owner: 'Reception / Assistant DG',
      tone: 'warning',
    };
  }

  if (bundle.letterCircuit.status === 'in_signature_circuit') {
    return {
      title: 'Retour signe attendu',
      description: 'Le courrier est en signature. Le scan du retour debloquera la reunion formelle.',
      owner: 'Reception / Assistant DG',
      tone: 'warning',
    };
  }

  if (bundle.letterCircuit.status === 'signed') {
    return {
      title: 'Finalisation du retour attendue',
      description: 'Ancien statut intermediaire: finaliser le retour signe depuis Courriers a traiter.',
      owner: 'Reception / Assistant DG',
      tone: 'warning',
    };
  }

  if (bundle.completionRate < 11) {
    return {
      title: 'Documents obligatoires manquants',
      description: `${bundle.completionRate}/11 documents deposes. Tous les documents obligatoires doivent etre deposes.`,
      owner: 'DN',
      tone: 'warning',
    };
  }

  if (!bundle.meeting) {
    return {
      title: 'Reunion formelle a planifier',
      description: 'Planifier la reunion formelle. Le compte-rendu reste facultatif pour la cloture.',
      owner: 'DN',
      tone: 'info',
    };
  }

  if (bundle.meeting.status === 'scheduled') {
    return {
      title: 'Reunion formelle a resoudre',
      description: 'Marquer la reunion comme tenue, absence constatee, reprogrammee ou dossier annule.',
      owner: 'DN',
      tone: 'info',
    };
  }

  return {
    title: 'Phase prete a cloturer',
    description: 'Les conditions obligatoires sont satisfaites. Le compte-rendu peut etre ajoute, mais il est facultatif.',
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
