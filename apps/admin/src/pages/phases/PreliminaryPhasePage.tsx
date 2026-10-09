import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../hooks/useAuth';
import WorkflowCockpit from './components/WorkflowCockpit';
import { useDossierState } from './components/DossierReadOnly';
import ClosureCard from './preliminary/components/ClosureCard';
import DeclarationCard from './preliminary/components/DeclarationCard';
import MeetingCard from './preliminary/components/MeetingCard';
import {
  buildChecklist,
  canClosePreliminaryPhase,
  formatDate,
  isMeetingResolved,
  preliminaryWorkflowSummary,
} from './preliminary/helpers';
import { usePreliminaryBundle } from './preliminary/hooks/usePreliminaryBundle';
import { MEETING_STATUS_LABELS } from './preliminary/constants';

export default function PreliminaryPhasePage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);

  const { bundle, loading, error, startPhase, startingPhase } = usePreliminaryBundle(
    requestId,
    setActionError
  );
  // K7b - closed dossier: read-only (components/DossierReadOnly.tsx).
  const dossierState = useDossierState(requestId);
  const dossierClosed = !!dossierState?.closed;

  if (loading) return <p className="p-6 text-anac-muted">Chargement...</p>;
  if (error) return <p className="p-6 text-anac-danger">{error}</p>;

  const canClose = canClosePreliminaryPhase(bundle);
  const meetingResolved = isMeetingResolved(bundle);
  const blockReason = !meetingResolved
    ? 'La clôture sera disponible une fois la réunion résolue.'
    : 'La clôture sera disponible une fois la déclaration retournée par le postulant.';
  const summary = bundle ? preliminaryWorkflowSummary(bundle, canClose ? null : blockReason) : null;
  const checklist = bundle ? buildChecklist(bundle) : [];
  const action = summary
    ? {
        title: summary.title,
        description: summary.description,
        owner: summary.owner,
        tone: summary.tone,
        blockReason: summary.blockReason,
      }
    : {
        title: 'Démarrer la phase',
        description: 'Ouvrir la phase préliminaire pour commencer le traitement opérationnel.',
        owner: 'DN',
        tone: 'info' as const,
        primaryAction: {
          label: startingPhase ? 'Démarrage...' : 'Démarrer la phase',
          onClick: startPhase,
          disabled: startingPhase,
        },
      };
  const keyInfo = [
    { label: 'Responsable', value: action.owner },
    { label: "Date d'ouverture", value: formatDate(bundle?.phase?.openedAt) },
    {
      label: 'Réunion',
      value: bundle?.meeting ? MEETING_STATUS_LABELS[bundle.meeting.status] ?? bundle.meeting.status : 'Non planifiée',
    },
    {
      label: 'Déclaration',
      value: bundle?.evaluation?.submittedFileUrl
        ? 'Retournée'
        : bundle?.evaluation?.madeAvailableAt
          ? 'En attente'
          : '-',
      tone: bundle?.evaluation?.submittedFileUrl ? 'success' : 'muted',
    },
    {
      label: 'Compte-rendu',
      value: bundle?.meeting?.crDocumentUrl ? 'Déposé' : 'Facultatif',
      tone: bundle?.meeting?.crDocumentUrl ? 'success' : 'muted',
    },
  ] as const;

  return (
    <WorkflowCockpit
      requestId={requestId}
      currentCode="M3"
      title="Phase - Préliminaire"
      subtitle={`Demande #${requestId ?? '-'}`}
      phaseStatus={bundle?.phase?.status}
      onBack={() => navigate('/')}
      checklistTitle="Checklist - phase en cours"
      checklist={checklist}
      action={action}
      keyInfo={keyInfo}
    >
      <div className="space-y-4">
        {actionError && (
          <p className="rounded border border-anac-danger/20 bg-anac-danger/5 px-3 py-2 text-sm text-anac-danger">
            {actionError}
          </p>
        )}

        {!bundle?.phase ? (
          <div className="card">
            <p className="mb-3 text-sm text-anac-muted">
              {dossierClosed
                ? 'Phase non démarrée - dossier clos.'
                : 'Cette demande est en attente de traitement. Démarrez la phase préliminaire pour commencer.'}
            </p>
            {!dossierClosed && (
              <Button onClick={startPhase} disabled={startingPhase}>
                {startingPhase ? 'Démarrage...' : 'Démarrer la Phase Préliminaire'}
              </Button>
            )}
          </div>
        ) : (
          <>
            <MeetingCard
              phaseId={bundle.phase.id}
              meeting={bundle.meeting}
              dnAgentId={user?.id ?? 0}
              requestId={requestId}
              setActionError={setActionError}
            />

            <DeclarationCard
              phaseId={bundle.phase.id}
              evaluation={bundle.evaluation}
              circuit={bundle.circuit}
              meetingHeld={bundle.meeting?.status === 'held'}
              requestId={requestId}
              setActionError={setActionError}
            />

            {!dossierClosed && bundle.phase.status === 'open' && canClose && (
              <ClosureCard
                phaseId={bundle.phase.id}
                requestId={requestId}
                setActionError={setActionError}
              />
            )}

            {!dossierClosed && bundle.phase.status === 'open' && !canClose && (
              <div className="card">
                <p className="text-sm text-anac-muted">{blockReason}</p>
              </div>
            )}
          </>
        )}
      </div>
    </WorkflowCockpit>
  );
}
