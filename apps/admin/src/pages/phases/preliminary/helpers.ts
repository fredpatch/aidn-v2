import type { ChecklistItem, PreliminaryBundle } from './types';
import { canApplicantSubmitDeclaration } from '@aidn/shared';
import type { PhaseWorkflowSummaryState } from '../components/workflow-state';
import { APPLICANT_OWNER, ASSISTANT_DG_OWNER, DN_OWNER, RECEPTION_OWNER, scheduledMeetingState } from '../owners';

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

/** M3 « Compte-rendu » metric: a DN CR without a signed copy shows « Signé attendu » (informational only). */
export function reportMetricValue(meeting: PreliminaryBundle['meeting']): string {
  if (!meeting?.crDocumentUrl) return 'Facultatif';
  return meeting.signedCrDocumentUrl ? 'Déposé' : 'Signé attendu';
}

export function preliminaryClosureBlockReason(bundle: PreliminaryBundle | null): string {
  if (!isMeetingResolved(bundle)) return 'La clôture sera disponible une fois la réunion résolue.';
  if (!isDeclarationSubmitted(bundle)) {
    return 'La clôture sera disponible une fois la déclaration retournée par le postulant.';
  }
  return 'La clôture sera disponible au retour du circuit DG de la déclaration.';
}

export function preliminaryWorkflowSummary(
  bundle: PreliminaryBundle,
  blockReason: string | null
): PhaseWorkflowSummaryState {
  const phaseStatus = bundle.phase?.status ?? 'open';
  const reportStatus = reportMetricValue(bundle.meeting);
  const metrics = (meeting: string, declaration: string) => [
    { label: 'Réunion', value: meeting },
    { label: 'Déclaration', value: declaration },
    { label: 'Compte-rendu', value: reportStatus },
  ];

  if (phaseStatus === 'closed') {
    return {
      title: 'Phase clôturée',
      description: 'Cette phase est en consultation seule. Les pièces restent disponibles pour audit.',
      state: 'done',
      owner: DN_OWNER,
      phaseStatus,
      metrics: metrics(
        bundle.meeting?.status === 'held' ? 'Tenue' : 'Résolue',
        bundle.evaluation?.submittedFileUrl ? 'Retournée' : '-'
      ),
    };
  }

  if (!bundle.meeting) {
    return {
      title: 'Réunion préliminaire à planifier',
      description: 'Planifier la réunion préliminaire pour démarrer le traitement opérationnel.',
      state: 'action_required',
      owner: DN_OWNER,
      phaseStatus,
      blockReason,
      metrics: metrics('Non planifiée', bundle.evaluation?.madeAvailableAt ? 'Disponible' : '-'),
    };
  }

  if (bundle.meeting.status === 'scheduled') {
    return {
      ...scheduledMeetingState(bundle.meeting, 'préliminaire'),
      phaseStatus,
      blockReason,
      metrics: metrics('Planifiée', bundle.evaluation?.madeAvailableAt ? 'Disponible' : '-'),
    };
  }

  if (!bundle.evaluation?.submittedFileUrl) {
    const awaitingApplicant = !!bundle.evaluation && canApplicantSubmitDeclaration(bundle.evaluation);
    return {
      title: awaitingApplicant ? 'Déclaration attendue' : 'Déclaration à mettre à disposition',
      description: awaitingApplicant
        ? 'La déclaration de pré-évaluation doit être retournée par le postulant.'
        : 'Mettre la déclaration de pré-évaluation à disposition du postulant.',
      state: awaitingApplicant ? 'waiting' : 'action_required',
      owner: awaitingApplicant ? APPLICANT_OWNER : DN_OWNER,
      phaseStatus,
      blockReason,
      metrics: metrics('Résolue', bundle.evaluation?.madeAvailableAt ? 'En attente' : '-'),
    };
  }

  if (bundle.circuit?.status !== 'pending_review') {
    const inCircuit = bundle.circuit?.status === 'in_signature_circuit' || bundle.circuit?.status === 'signed';
    return inCircuit
      ? {
          title: 'Circuit DG en cours',
          description: 'La déclaration retournée doit revenir signée/visée par la DG avant de clôturer la phase.',
          state: 'waiting',
          owner: ASSISTANT_DG_OWNER,
          phaseStatus,
          blockReason,
          metrics: metrics('Résolue', 'Retournée'),
        }
      : {
          title: 'Impression et mise en circuit DG de la déclaration',
          description: 'Imprimer la déclaration retournée puis la mettre en circuit de signature DG.',
          state: 'action_required',
          owner: RECEPTION_OWNER,
          phaseStatus,
          blockReason,
          metrics: metrics('Résolue', 'Retournée'),
        };
  }

  return {
    title: 'Phase prête à clôturer',
    description: 'Les conditions obligatoires sont satisfaites. Le compte-rendu reste facultatif.',
    state: 'action_required',
    owner: DN_OWNER,
    phaseStatus,
    metrics: metrics('Résolue', 'Retournée'),
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
