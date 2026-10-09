import type { ChecklistItem, PreliminaryBundle } from './types';
import type { PhaseWorkflowSummaryState } from '../components/PhaseWorkflowSummary';

export function buildChecklist(bundle: PreliminaryBundle): ChecklistItem[] {
  return [
    {
      label: 'Réunion planifiée',
      done: !!bundle.meeting,
    },
    {
      label: 'Réunion tenue ou absence constatée',
      done: !!bundle.meeting && bundle.meeting.status !== 'scheduled',
    },
    {
      label: 'Compte-rendu envoyé',
      done: !!bundle.meeting?.crDocumentUrl,
      optional: true,
    },
    {
      label: 'Déclaration mise à disposition',
      done: !!bundle.evaluation?.madeAvailableAt,
    },
    {
      label: 'Déclaration retournée par le postulant',
      done: !!bundle.evaluation?.submittedFileUrl,
    },
    {
      label: 'Retour signé / visé DG reçu',
      done: bundle.circuit?.status === 'pending_review',
    },
    {
      label: 'Phase clôturée',
      done: bundle.phase?.status === 'closed',
    },
  ];
}

export function isMeetingResolved(bundle: PreliminaryBundle | null): boolean {
  return !!bundle?.meeting && bundle.meeting.status !== 'scheduled';
}

export function isDeclarationSubmitted(bundle: PreliminaryBundle | null): boolean {
  return !!bundle?.evaluation?.submittedFileUrl;
}

/** PRELIM-DG-CIRCUIT-1 - the declaration must also have completed the DG
 *  signature circuit; applicant submission alone must never make M3
 *  closable. Mirrors the backend guard (phases.service.ts::closePhase) -
 *  this is UI feedback only, the backend remains authoritative. */
export function isCircuitReturned(bundle: PreliminaryBundle | null): boolean {
  return bundle?.circuit?.status === 'pending_review';
}

export function canClosePreliminaryPhase(bundle: PreliminaryBundle | null): boolean {
  return isMeetingResolved(bundle) && isDeclarationSubmitted(bundle) && isCircuitReturned(bundle);
}

export function preliminaryWorkflowSummary(
  bundle: PreliminaryBundle,
  blockReason: string | null
): PhaseWorkflowSummaryState {
  const phaseStatus = bundle.phase?.status ?? 'open';
  const reportStatus = bundle.meeting?.crDocumentUrl ? 'Déposé' : 'Facultatif';

  if (phaseStatus === 'closed') {
    return {
      title: 'Phase clôturée',
      description: 'Cette phase est en consultation seule. Les pièces restent disponibles pour audit.',
      owner: 'DN',
      tone: 'muted',
      phaseStatus,
      metrics: [
        { label: 'Réunion', value: bundle.meeting?.status === 'held' ? 'Tenue' : 'Résolue' },
        { label: 'Déclaration', value: bundle.evaluation?.submittedFileUrl ? 'Retournée' : '-' },
        { label: 'Compte-rendu', value: reportStatus },
      ],
    };
  }

  if (!bundle.meeting) {
    return {
      title: 'Réunion préliminaire à planifier',
      description: 'Planifier la réunion préliminaire pour démarrer le traitement opérationnel.',
      owner: 'DN',
      tone: 'warning',
      phaseStatus,
      blockReason,
      metrics: [
        { label: 'Réunion', value: 'Non planifiée' },
        { label: 'Déclaration', value: bundle.evaluation?.madeAvailableAt ? 'Disponible' : '-' },
        { label: 'Compte-rendu', value: reportStatus },
      ],
    };
  }

  if (bundle.meeting.status === 'scheduled') {
    return {
      title: 'Réunion préliminaire à résoudre',
      description: 'Marquer la réunion comme tenue, absence constatée, reprogrammée ou dossier annulé.',
      owner: 'DN',
      tone: 'info',
      phaseStatus,
      blockReason,
      metrics: [
        { label: 'Réunion', value: 'Planifiée' },
        { label: 'Déclaration', value: bundle.evaluation?.madeAvailableAt ? 'Disponible' : '-' },
        { label: 'Compte-rendu', value: reportStatus },
      ],
    };
  }

  if (!bundle.evaluation?.submittedFileUrl) {
    return {
      title: 'Déclaration attendue',
      description: 'La déclaration de pré-évaluation doit être retournée par le postulant.',
      owner: 'Postulant',
      tone: 'warning',
      phaseStatus,
      blockReason,
      metrics: [
        { label: 'Réunion', value: 'Résolue' },
        { label: 'Déclaration', value: bundle.evaluation?.madeAvailableAt ? 'En attente' : '-' },
        { label: 'Compte-rendu', value: reportStatus },
      ],
    };
  }

  if (bundle.circuit?.status !== 'pending_review') {
    return {
      title: 'Circuit DG en cours',
      description: 'La déclaration retournée doit revenir signée/visée par la DG avant de clôturer la phase.',
      owner: 'Réception / Assistant DG',
      tone: 'info',
      phaseStatus,
      blockReason,
      metrics: [
        { label: 'Réunion', value: 'Résolue' },
        { label: 'Déclaration', value: 'Retournée' },
        { label: 'Compte-rendu', value: reportStatus },
      ],
    };
  }

  return {
    title: 'Phase prête à clôturer',
    description: 'Les conditions obligatoires sont satisfaites. Le compte-rendu reste facultatif.',
    owner: 'DN',
    tone: 'success',
    phaseStatus,
    metrics: [
      { label: 'Réunion', value: 'Résolue' },
      { label: 'Déclaration', value: 'Retournée' },
      { label: 'Compte-rendu', value: reportStatus },
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
