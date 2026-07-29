import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { useAuth } from '../../../hooks/useAuth';
import WorkflowCockpit from '../components/WorkflowCockpit';
import PaymentCard from './components/PaymentCard';
import SiteVisitCard from './components/SiteVisitCard';
import VerdictCard from './components/VerdictCard';
import { buildChecklist, formatDate, siteInspectionWorkflowSummary } from './helpers';
import { useSiteInspectionBundle } from './hooks/useSiteInspectionBundle';

const DN_ROLES = ['dn_agent', 'dn_supervisor', 'SU'];
const S5_ROLES = ['s5_agent', 'SU'];
const R3_ROLES = ['r3_agent', 'SU'];

function hasAnyRole(userRoles: string[] | undefined, allowedRoles: string[]): boolean {
  return allowedRoles.some((role) => userRoles?.includes(role));
}

export default function SiteInspectionPhasePage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);

  const { bundle, loading, error, startPhase, startingPhase } = useSiteInspectionBundle(
    requestId,
    setActionError
  );

  if (loading) return <p className="p-6 text-anac-muted">Chargement...</p>;
  if (error) return <p className="p-6 text-anac-danger">{error}</p>;

  const checklist = bundle ? buildChecklist(bundle) : [];
  const summary = bundle ? siteInspectionWorkflowSummary(bundle) : null;
  const canManagePayment = hasAnyRole(user?.roles, S5_ROLES);
  const canOperateDnWorkflow = hasAnyRole(user?.roles, DN_ROLES);
  const canSubmitInspectionOpinion = hasAnyRole(user?.roles, R3_ROLES);
  const isS5OnlyView = canManagePayment && !canOperateDnWorkflow;
  const isR3OnlyView =
    canSubmitInspectionOpinion && !canOperateDnWorkflow && !canManagePayment;

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
          <h1 className="text-xl font-semibold text-anac-navy">
            Paiement - Demonstration / Inspection
          </h1>
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

  if (isR3OnlyView) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <button
          onClick={() => navigate('/mes-inspections')}
          className="text-xs text-anac-muted transition-colors hover:text-anac-navy"
        >
          {'<-'} Retour aux inspections
        </button>

        <div>
          <h1 className="text-xl font-semibold text-anac-navy">Avis R3 - Inspection sur site</h1>
          <p className="text-sm text-anac-muted">Demande #{requestId}</p>
        </div>

        {actionError && <p className="text-sm text-anac-danger">{actionError}</p>}

        {!bundle?.phase ? (
          <div className="card">
            <p className="text-sm text-anac-muted">
              Aucune inspection R3 n&apos;est disponible pour cette demande.
            </p>
          </div>
        ) : (
          <>
            <SiteVisitCard
              phaseId={bundle.phase.id}
              siteVisit={bundle.siteVisit}
              requestId={requestId}
              invoiceSent={!!bundle.payment?.invoiceFileUrl}
              canScheduleVisit={false}
              canMarkHeld
              setActionError={setActionError}
            />

            <VerdictCard
              phaseId={bundle.phase.id}
              siteVisit={bundle.siteVisit}
              inspection={bundle.inspection}
              paymentValidated={bundle.payment?.status === 'validated'}
              requestId={requestId}
              setActionError={setActionError}
            />
          </>
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
        description: 'Ouvrir la demonstration / inspection apres l evaluation approfondie.',
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
      label: 'Visite',
      value: bundle?.siteVisit?.status ?? 'Non planifiee',
      tone: bundle?.siteVisit?.status === 'held' ? 'success' : 'muted',
    },
    {
      label: 'Avis R3',
      value: bundle?.inspection ? 'Soumis' : 'Attendu',
      tone: bundle?.inspection ? 'success' : 'warning',
    },
  ] as const;

  return (
    <WorkflowCockpit
      requestId={requestId}
      currentCode="M6"
      title="Phase - Demonstration / Inspection"
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
              La phase d&apos;evaluation approfondie doit etre cloturee avant de demarrer la
              demonstration/inspection.
            </p>
            <Button onClick={startPhase} disabled={startingPhase}>
              {startingPhase ? 'Demarrage...' : 'Demarrer la Phase - Demonstration/Inspection'}
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

            <SiteVisitCard
              phaseId={bundle.phase.id}
              siteVisit={bundle.siteVisit}
              requestId={requestId}
              invoiceSent={!!bundle.payment?.invoiceFileUrl}
              canScheduleVisit={canOperateDnWorkflow}
              canMarkHeld={canSubmitInspectionOpinion && !canOperateDnWorkflow}
              setActionError={setActionError}
            />

            <VerdictCard
              phaseId={bundle.phase.id}
              siteVisit={bundle.siteVisit}
              inspection={bundle.inspection}
              paymentValidated={bundle.payment?.status === 'validated'}
              requestId={requestId}
              setActionError={setActionError}
            />
          </>
        )}
      </div>
    </WorkflowCockpit>
  );
}
