import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { useAuth } from '../../../hooks/useAuth';
import WorkflowCockpit from '../components/WorkflowCockpit';
import DeepEvaluationClosureCard from './components/DeepEvaluationClosureCard';
import DocumentEvaluationsCard from './components/DocumentEvaluationsCard';
import PaymentCard from './components/PaymentCard';
import {
  buildChecklist,
  canCloseDeepEvaluation,
  closureBlockReason,
  deepEvaluationWorkflowSummary,
  formatDate,
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

  if (loading) return <p className="p-6 text-anac-muted">Chargement...</p>;
  if (error) return <p className="p-6 text-anac-danger">{error}</p>;

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
          className="text-xs text-anac-muted transition-colors hover:text-anac-navy"
        >
          {'<-'} Retour aux paiements S5
        </button>

        <div>
          <h1 className="text-xl font-semibold text-anac-navy">Paiement - Evaluation approfondie</h1>
          <p className="text-sm text-anac-muted">Demande #{requestId}</p>
        </div>

        {actionError && <p className="text-sm text-anac-danger">{actionError}</p>}

        {!bundle?.phase ? (
          <div className="card">
            <p className="text-sm text-anac-muted">
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
        description: 'Ouvrir l evaluation approfondie apres la cloture de la demande formelle.',
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
    { label: 'Paiement', value: bundle?.payment?.status ?? 'Facture attendue' },
    {
      label: 'Documents valides',
      value: bundle ? `${bundle.completionRate.validated}/${bundle.completionRate.total}` : '-',
      tone:
        bundle && bundle.completionRate.total > 0 && bundle.completionRate.validated === bundle.completionRate.total
          ? 'success'
          : 'warning',
    },
    { label: 'A corriger', value: String(bundle?.completionRate.needsAction ?? 0) },
  ] as const;

  return (
    <WorkflowCockpit
      requestId={requestId}
      currentCode="M5"
      title="Phase - Evaluation Approfondie"
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
              La phase de demande formelle doit etre cloturee avant de demarrer l&apos;evaluation
              approfondie.
            </p>
            <Button onClick={startPhase} disabled={startingPhase}>
              {startingPhase ? 'Demarrage...' : 'Demarrer la Phase - Evaluation Approfondie'}
            </Button>
          </div>
        ) : (
          <>
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
                <p className="text-sm text-anac-muted">{blockReason}</p>
              </div>
            )}
          </>
        )}
      </div>
    </WorkflowCockpit>
  );
}
