import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/button';
import ClosureCard from './preliminary/components/ClosureCard';
import DeclarationCard from './preliminary/components/DeclarationCard';
import MeetingCard from './preliminary/components/MeetingCard';
import PhaseHeader from './preliminary/components/PhaseHeader';
import PhaseSidebar from './preliminary/components/PhaseSidebar';
import PhaseStatusBadge from './preliminary/components/PhaseStatusBadge';
import { canClosePreliminaryPhase, isMeetingResolved } from './preliminary/helpers';
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

  if (loading) return <p className="text-anac-muted p-6">Chargement...</p>;
  if (error) return <p className="text-anac-danger p-6">{error}</p>;

  const canClose = canClosePreliminaryPhase(bundle);
  const meetingResolved = isMeetingResolved(bundle);

  return (
    <div className="flex gap-6 items-start">
      <div className="w-64 flex-shrink-0 space-y-4">
        <button
          onClick={() => navigate('/')}
          className="text-anac-muted text-xs hover:text-anac-navy transition-colors"
        >
          ← Retour aux demandes
        </button>
        <PhaseSidebar bundle={bundle} />
      </div>

      <div className="flex-1 min-w-0 space-y-6">
        <PhaseHeader requestId={requestId ?? '-'} />

        {actionError && <p className="text-anac-danger text-sm">{actionError}</p>}

        {!bundle?.phase ? (
          <div className="card">
            <p className="text-anac-muted text-sm mb-3">
              Cette demande est en attente de traitement. Démarrez la phase préliminaire pour
              commencer.
            </p>
            <Button onClick={startPhase} disabled={startingPhase}>
              {startingPhase ? 'Demarrage...' : 'Demarrer la Phase Preliminaire'}
            </Button>
          </div>
        ) : (
          <>
            <div className="card flex items-center justify-between">
              <span className="text-sm font-medium">Statut de la phase</span>
              <PhaseStatusBadge
                status={bundle.phase.status}
                label={bundle.phase.status === 'closed' ? 'Cloturee' : 'Ouverte'}
                toneMap={{
                  closed: 'bg-anac-muted/10 text-anac-muted',
                  open: 'bg-anac-success/10 text-anac-success',
                }}
              />
            </div>

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
                <p className="text-anac-muted text-sm">
                  {!meetingResolved
                    ? 'La cloture sera disponible une fois la reunion resolue (tenue, absence, ou dossier annule).'
                    : 'La cloture sera disponible une fois la declaration de pre-evaluation retournee par le postulant.'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
