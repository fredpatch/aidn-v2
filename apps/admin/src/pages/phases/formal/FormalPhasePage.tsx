import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../../components/ui/button';
import PhaseSidebar from '../../phases/preliminary/components/PhaseSidebar';
import PhaseStatusBadge from '../../phases/preliminary/components/PhaseStatusBadge';
import FormalLetterCard from './components/FormalLetterCard';
import DocumentsChecklistCard from './components/DocumentsChecklistCard';
import FormalMeetingCard from './components/FormalMeetingCard';
import FormalClosureCard from './components/FormalClosureCard';
import { buildChecklist, canCloseFormalPhase, closureBlockReason } from './helpers';
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

  if (loading) return <p className="text-anac-muted p-6">Chargement...</p>;
  if (error) return <p className="text-anac-danger p-6">{error}</p>;

  const canClose = canCloseFormalPhase(bundle);
  const letterSubmitted = !!bundle?.letterCircuit;
  const blockReason = closureBlockReason(bundle);
  const checklist = bundle ? buildChecklist(bundle) : [];

  return (
    <div className="flex gap-6 items-start">
      {/* Left column */}
      <div className="w-64 flex-shrink-0 space-y-4">
        <button
          onClick={() => navigate('/')}
          className="text-anac-muted text-xs hover:text-anac-navy transition-colors"
        >
          ← Retour aux demandes
        </button>
        <PhaseSidebar
          bundle={null}
          requestId={requestId}
          currentCode="M4"
          checklistTitle="Checklist — Demande Formelle"
          checklist={checklist}
        />
      </div>

      {/* Right column */}
      <div className="flex-1 min-w-0 space-y-6">
        <div>
          <h1 className="text-anac-navy text-xl font-semibold">Phase — Demande Formelle</h1>
          <p className="text-anac-muted text-sm">Demande #{requestId}</p>
        </div>

        {actionError && <p className="text-anac-danger text-sm">{actionError}</p>}

        {!bundle?.phase ? (
          <div className="card">
            <p className="text-anac-muted text-sm mb-3">
              La phase préliminaire doit être clôturée avant de démarrer la demande formelle.
            </p>
            <Button onClick={startPhase} disabled={startingPhase}>
              {startingPhase ? 'Démarrage...' : 'Démarrer la Phase — Demande Formelle'}
            </Button>
          </div>
        ) : (
          <>
            <div className="card flex items-center justify-between">
              <span className="text-sm font-medium">Statut de la phase</span>
              <PhaseStatusBadge
                status={bundle.phase.status}
                label={bundle.phase.status === 'closed' ? 'Clôturée' : 'Ouverte'}
                toneMap={{
                  closed: 'bg-anac-muted/10 text-anac-muted',
                  open: 'bg-anac-success/10 text-anac-success',
                }}
              />
            </div>

            <FormalLetterCard
              requestId={requestId}
              circuit={bundle.letterCircuit}
              setActionError={setActionError}
            />

            <DocumentsChecklistCard
              requestId={requestId}
              documents={bundle.documents}
              completionRate={bundle.completionRate}
              phaseClosed={bundle.phase.status === 'closed'}
              setActionError={setActionError}
            />

            <FormalMeetingCard
              phaseId={bundle.phase.id}
              meeting={bundle.meeting}
              dnAgentId={user?.id ?? 0}
              requestId={requestId}
              letterSubmitted={letterSubmitted}
              setActionError={setActionError}
            />

            {bundle.phase.status === 'open' && canClose && (
              <FormalClosureCard
                phaseId={bundle.phase.id}
                requestId={requestId}
                setActionError={setActionError}
              />
            )}

            {bundle.phase.status === 'open' && !canClose && blockReason && (
              <div className="card">
                <p className="text-anac-muted text-sm">{blockReason}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
