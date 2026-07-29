import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { useAuth } from '../../../hooks/useAuth';
import WorkflowCockpit from '../components/WorkflowCockpit';
import DocumentsChecklistCard from './components/DocumentsChecklistCard';
import FormalClosureCard from './components/FormalClosureCard';
import FormalLetterCard from './components/FormalLetterCard';
import FormalMeetingCard from './components/FormalMeetingCard';
import {
  buildChecklist,
  canCloseFormalPhase,
  closureBlockReason,
  formalNextAction,
  formatDate,
} from './helpers';
import { useFormalBundle } from './hooks/useFormalBundle';

export default function FormalPhasePage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);

  const { bundle, loading, error, startPhase, startingPhase } = useFormalBundle(
    requestId,
    setActionError
  );

  if (loading) return <p className="p-6 text-anac-muted">Chargement...</p>;
  if (error) return <p className="p-6 text-anac-danger">{error}</p>;

  const canClose = canCloseFormalPhase(bundle);
  const letterReturned = bundle?.letterCircuit?.status === 'pending_review';
  const blockReason = closureBlockReason(bundle);
  const checklist = bundle ? buildChecklist(bundle) : [];
  const nextAction = formalNextAction(bundle);
  const canManageFormal =
    user?.roles.some((role) => ['dn_agent', 'dn_supervisor', 'SU'].includes(role)) ?? false;

  const keyInfo = [
    { label: 'Responsable', value: nextAction.owner },
    { label: "Date d'ouverture", value: formatDate(bundle?.phase?.openedAt) },
    { label: 'Documents soumis', value: `${bundle?.completionRate ?? 0}/11` },
    {
      label: 'Circuit signature',
      value: letterReturned ? 'Retour signe' : 'En attente',
      tone: letterReturned ? 'success' : 'warning',
    },
    {
      label: 'Reunion formelle',
      value: bundle?.meeting?.status ?? 'Non planifiee',
      tone: bundle?.meeting && bundle.meeting.status !== 'scheduled' ? 'success' : 'muted',
    },
  ] as const;

  return (
    <WorkflowCockpit
      requestId={requestId}
      currentCode="M4"
      title="Phase - Demande Formelle"
      subtitle={`Demande #${requestId ?? '-'}`}
      phaseStatus={bundle?.phase?.status}
      onBack={() => navigate('/')}
      checklistTitle="Checklist - phase en cours"
      checklist={checklist}
      action={{
        ...nextAction,
        blockReason,
        primaryAction: !bundle?.phase
          ? {
              label: startingPhase ? 'Demarrage...' : 'Demarrer la phase',
              onClick: startPhase,
              disabled: startingPhase,
            }
          : undefined,
      }}
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
              La phase preliminaire doit etre cloturee avant de demarrer la demande formelle.
            </p>
            <Button onClick={startPhase} disabled={startingPhase}>
              {startingPhase ? 'Demarrage...' : 'Demarrer la Phase - Demande Formelle'}
            </Button>
          </div>
        ) : (
          <>
            <FormalLetterCard circuit={bundle.letterCircuit} />

            <DocumentsChecklistCard
              documents={bundle.documents}
              completionRate={bundle.completionRate}
              phaseClosed={bundle.phase.status === 'closed'}
            />

            <FormalMeetingCard
              phaseId={bundle.phase.id}
              meeting={bundle.meeting}
              dnAgentId={user?.id ?? 0}
              requestId={requestId}
              letterReturned={letterReturned}
              canManage={canManageFormal && bundle.phase.status === 'open'}
              setActionError={setActionError}
            />

            {bundle.phase.status === 'open' && canClose && canManageFormal && (
              <FormalClosureCard
                phaseId={bundle.phase.id}
                requestId={requestId}
                setActionError={setActionError}
              />
            )}

            {bundle.phase.status === 'open' && canClose && !canManageFormal && (
              <div className="card">
                <p className="text-sm text-anac-muted">
                  La phase est prete a etre cloturee. Action reservee a la DN.
                </p>
              </div>
            )}

            {bundle.phase.status === 'open' && !canClose && blockReason && (
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
