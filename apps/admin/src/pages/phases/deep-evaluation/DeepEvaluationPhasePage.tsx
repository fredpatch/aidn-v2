import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../../components/ui/button';
import PhaseSidebar from '../preliminary/components/PhaseSidebar';
import PhaseStatusBadge from '../preliminary/components/PhaseStatusBadge';
import PhaseWorkflowSummary from '../components/PhaseWorkflowSummary';
import PaymentCard from './components/PaymentCard';
import DocumentEvaluationsCard from './components/DocumentEvaluationsCard';
import DeepEvaluationClosureCard from './components/DeepEvaluationClosureCard';
import {
  buildChecklist,
  canCloseDeepEvaluation,
  closureBlockReason,
  deepEvaluationWorkflowSummary,
} from './helpers';
import { useDeepEvaluationBundle } from './hooks/useDeepEvaluationBundle';

const DN_ROLES = ['dn_agent', 'dn_supervisor', 'SU'];
const S5_ROLES = ['s5_agent', 'SU'];

function hasAnyRole(userRoles: string[] | undefined, allowedRoles: string[]): boolean {
  return allowedRoles.some((role) => userRoles?.includes(role));
}

export default function DeepEvaluationPhasePage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [actionError, setActionError] = useState<string | null>(null);

  const { bundle, loading, error, startPhase, startingPhase } = useDeepEvaluationBundle(
    requestId,
    setActionError
  );

  if (loading) return <p className="text-anac-muted p-6">Chargement...</p>;
  if (error) return <p className="text-anac-danger p-6">{error}</p>;

  const canClose = canCloseDeepEvaluation(bundle);
  const blockReason = closureBlockReason(bundle);
  const checklist = bundle ? buildChecklist(bundle) : [];
  const summary = bundle ? deepEvaluationWorkflowSummary(bundle, blockReason) : null;
  const canManagePayment = hasAnyRole(user?.roles, S5_ROLES);
  const canEvaluateDocuments = hasAnyRole(user?.roles, DN_ROLES);
  const isS5OnlyView = canManagePayment && !canEvaluateDocuments;

  if (isS5OnlyView) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <button
          onClick={() => navigate('/paiements-s5')}
          className="text-anac-muted text-xs hover:text-anac-navy transition-colors"
        >
          â† Retour aux paiements S5
        </button>

        <div>
          <h1 className="text-anac-navy text-xl font-semibold">Paiement - Evaluation approfondie</h1>
          <p className="text-anac-muted text-sm">Demande #{requestId}</p>
        </div>

        {actionError && <p className="text-anac-danger text-sm">{actionError}</p>}

        {!bundle?.phase ? (
          <div className="card">
            <p className="text-anac-muted text-sm">
              Aucun paiement S5 n&apos;est disponible pour cette demande.
            </p>
          </div>
        ) : (
          <PaymentCard
            requestId={requestId}
            phaseId={bundle.phase.id}
            payment={bundle.payment}
            canManagePayment={canManagePayment}
            setActionError={setActionError}
          />
        )}
      </div>
    );
  }

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
          currentCode="M5"
          checklistTitle="Checklist — Évaluation approfondie"
          checklist={checklist}
        />
      </div>

      {/* Right column */}
      <div className="flex-1 min-w-0 space-y-6">
        <div>
          <h1 className="text-anac-navy text-xl font-semibold">
            Phase — Évaluation Approfondie des Documents
          </h1>
          <p className="text-anac-muted text-sm">Demande #{requestId}</p>
        </div>

        {actionError && <p className="text-anac-danger text-sm">{actionError}</p>}

        {!bundle?.phase ? (
          <div className="card">
            <p className="text-anac-muted text-sm mb-3">
              La phase de demande formelle doit être clôturée avant de démarrer l&apos;évaluation
              approfondie.
            </p>
            <Button onClick={startPhase} disabled={startingPhase}>
              {startingPhase ? 'Démarrage...' : 'Démarrer la Phase — Évaluation Approfondie'}
            </Button>
          </div>
        ) : (
          <>
            <div className="card flex items-center justify-between">
              <span className="text-sm font-medium">Statut administratif de la phase</span>
              <PhaseStatusBadge
                status={bundle.phase.status}
                label={bundle.phase.status === 'closed' ? 'Clôturée' : 'Ouverte'}
                toneMap={{
                  closed: 'bg-anac-muted/10 text-anac-muted',
                  open: 'bg-anac-success/10 text-anac-success',
                }}
              />
            </div>

            {summary && <PhaseWorkflowSummary state={summary} />}

            <PaymentCard
              requestId={requestId}
              phaseId={bundle.phase.id}
              payment={bundle.payment}
              canManagePayment={canManagePayment}
              setActionError={setActionError}
            />

            <DocumentEvaluationsCard
              requestId={requestId}
              evaluations={bundle.evaluations}
              completionRate={bundle.completionRate}
              canEvaluateDocuments={canEvaluateDocuments}
              setActionError={setActionError}
            />

            {canEvaluateDocuments && bundle.phase.status === 'open' && canClose && (
              <DeepEvaluationClosureCard
                phaseId={bundle.phase.id}
                requestId={requestId}
                setActionError={setActionError}
              />
            )}

            {canEvaluateDocuments && bundle.phase.status === 'open' && !canClose && blockReason && (
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
