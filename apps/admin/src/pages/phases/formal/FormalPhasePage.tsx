import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { useAuth } from '../../../hooks/useAuth';
import WorkflowCockpit from '../components/WorkflowCockpit';
import { useDossierState } from '../components/DossierReadOnly';
import DocumentsChecklistCard from './components/DocumentsChecklistCard';
import { PhaseClosureCard } from '../../../components/phase-closure/PhaseClosureCard';
import { usePhaseClosure } from '../../../components/phase-closure/usePhaseClosure';
import { closureNextAction } from '../../../components/phase-closure/closureNextAction';
import { queryKeys } from '../../../lib/react-query/queryKeys';
import FormalLetterCard from './components/FormalLetterCard';
import FormalMeetingCard from './components/FormalMeetingCard';
import {
  buildChecklist,
  closureBlockReason,
  formalNextAction,
  formatDate,
} from './helpers';
import { useFormalBundle } from './hooks/useFormalBundle';
import { MEETING_STATUS_LABELS } from './constants';

export default function FormalPhasePage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);

  const { bundle, loading, error, startPhase, startingPhase } = useFormalBundle(
    requestId,
    setActionError
  );
  // K7b - closed dossier: read-only (components/DossierReadOnly.tsx).
  const dossierState = useDossierState(requestId);
  const dossierClosed = !!dossierState?.closed;
  const closure = usePhaseClosure(bundle?.phase?.id, queryKeys.formal.bundle(requestId ?? ''));

  if (loading) return <p className="p-6 text-anac-muted">Chargement...</p>;
  if (error) return <p className="p-6 text-anac-danger">{error}</p>;

  const letterReturned = bundle?.letterCircuit?.status === 'pending_review';
  const blockReason = closureBlockReason(bundle);
  const checklist = bundle ? buildChecklist(bundle) : [];
  const closureAction = closureNextAction(closure.state);
  const nextAction = closureAction ?? formalNextAction(bundle);
  const canManageFormal =
    user?.roles.some((role) => ['dn_agent', 'dn_supervisor', 'SU'].includes(role)) ?? false;

  const keyInfo = [
    { label: 'Responsable', value: nextAction.owner.label },
    { label: "Date d'ouverture", value: formatDate(bundle?.phase?.openedAt) },
    { label: 'Documents soumis', value: `${bundle?.completionRate ?? 0}/11` },
    {
      label: 'Circuit signature',
      value: letterReturned ? 'Retour signé' : 'En attente',
      tone: letterReturned ? 'success' : 'warning',
      closedValue: letterReturned ? undefined : 'Non retourné',
    },
    {
      label: 'Réunion formelle',
      value: bundle?.meeting ? MEETING_STATUS_LABELS[bundle.meeting.status] ?? bundle.meeting.status : 'Non planifiée',
      tone: bundle?.meeting && bundle.meeting.status !== 'scheduled' ? 'success' : 'muted',
    },
  ] as const;

  return (
    <WorkflowCockpit
      requestId={requestId}
      currentCode="M4"
      title="Phase - Demande Formelle"
      phaseStatus={bundle?.phase?.status}
      onBack={() => navigate(requestId ? `/demandes?id=${requestId}` : '/demandes')}
      checklistTitle="Checklist - phase en cours"
      checklist={checklist}
      action={{
        ...nextAction,
        blockReason: closureAction ? null : blockReason,
        primaryAction: !bundle?.phase
          ? {
              label: startingPhase ? 'Démarrage...' : 'Démarrer la phase',
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
              {dossierClosed
                ? 'Phase non démarrée - dossier clos.'
                : 'La phase préliminaire doit être clôturée avant de démarrer la demande formelle.'}
            </p>
            {!dossierClosed && (
              <Button onClick={startPhase} disabled={startingPhase}>
                {startingPhase ? 'Démarrage...' : 'Démarrer la Phase - Demande Formelle'}
              </Button>
            )}
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

            {/* WORKFLOW-FOUNDATION-1B - the only way this phase closes. */}
            <PhaseClosureCard
              state={closure.state}
              blocker={blockReason}
              dossierClosed={dossierClosed}
              depositing={closure.depositing}
              onDeposit={closure.depositCourrier}
            />
          </>
        )}
      </div>
    </WorkflowCockpit>
  );
}
