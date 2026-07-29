import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../hooks/useAuth';
import WorkflowCockpit from './components/WorkflowCockpit';
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

export default function PreliminaryPhasePage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);

  const { bundle, loading, error, startPhase, startingPhase } = usePreliminaryBundle(
    requestId,
    setActionError
  );

  if (loading) return <p className="p-6 text-anac-muted">Chargement...</p>;
  if (error) return <p className="p-6 text-anac-danger">{error}</p>;

  const canClose = canClosePreliminaryPhase(bundle);
  const meetingResolved = isMeetingResolved(bundle);
  const blockReason = !meetingResolved
    ? 'La cloture sera disponible une fois la reunion resolue.'
    : 'La cloture sera disponible une fois la declaration retournee par le postulant.';
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
        title: 'Demarrer la phase',
        description: 'Ouvrir la phase preliminaire pour commencer le traitement operationnel.',
        owner: 'DN',
        tone: 'info' as const,
        primaryAction: {
          label: startingPhase ? 'Demarrage...' : 'Demarrer la phase',
          onClick: startPhase,
          disabled: startingPhase,
        },
      };
  const keyInfo = [
    { label: 'Responsable', value: action.owner },
    { label: "Date d'ouverture", value: formatDate(bundle?.phase?.openedAt) },
    { label: 'Reunion', value: bundle?.meeting?.status ?? 'Non planifiee' },
    {
      label: 'Declaration',
      value: bundle?.evaluation?.submittedFileUrl
        ? 'Retournee'
        : bundle?.evaluation?.madeAvailableAt
          ? 'En attente'
          : '-',
      tone: bundle?.evaluation?.submittedFileUrl ? 'success' : 'muted',
    },
    {
      label: 'Compte-rendu',
      value: bundle?.meeting?.crDocumentUrl ? 'Depose' : 'Facultatif',
      tone: bundle?.meeting?.crDocumentUrl ? 'success' : 'muted',
    },
  ] as const;

  return (
    <WorkflowCockpit
      requestId={requestId}
      currentCode="M3"
      title="Phase - Preliminaire"
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
              Cette demande est en attente de traitement. Demarrez la phase preliminaire pour
              commencer.
            </p>
            <Button onClick={startPhase} disabled={startingPhase}>
              {startingPhase ? 'Demarrage...' : 'Demarrer la Phase Preliminaire'}
            </Button>
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
              meetingHeld={bundle.meeting?.status === 'held'}
              requestId={requestId}
              setActionError={setActionError}
            />

            {bundle.phase.status === 'open' && canClose && (
              <ClosureCard
                phaseId={bundle.phase.id}
                requestId={requestId}
                setActionError={setActionError}
              />
            )}

            {bundle.phase.status === 'open' && !canClose && (
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
