import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { useAuth } from '../../../hooks/useAuth';
import WorkflowCockpit from '../components/WorkflowCockpit';
import CertificateFieldsCard from './components/CertificateFieldsCard';
import LifecycleCard from './components/LifecycleCard';
import PaymentCard from './components/PaymentCard';
import ScopeDetailsCard from './components/ScopeDetailsCard';
import { buildChecklist, certificateWorkflowSummary, formatDate } from './helpers';
import { useCertificateBundle } from './hooks/useCertificateBundle';

const DN_ROLES = ['dn_agent', 'dn_supervisor', 'SU'];
const S5_ROLES = ['s5_agent', 'SU'];

function hasAnyRole(userRoles: string[] | undefined, allowedRoles: string[]): boolean {
  return allowedRoles.some((role) => userRoles?.includes(role));
}

export default function CertificatesPhasePage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);

  const { bundle, loading, error, startPhase, startingPhase } = useCertificateBundle(
    requestId,
    setActionError
  );

  if (loading) return <p className="p-6 text-anac-muted">Chargement...</p>;
  if (error) return <p className="p-6 text-anac-danger">{error}</p>;

  const checklist = bundle ? buildChecklist(bundle) : [];
  const summary = bundle ? certificateWorkflowSummary(bundle) : null;
  const canManagePayment = hasAnyRole(user?.roles, S5_ROLES);
  const canOperateDnWorkflow = hasAnyRole(user?.roles, DN_ROLES);
  const isS5OnlyView = canManagePayment && !canOperateDnWorkflow;

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
          <h1 className="text-xl font-semibold text-anac-navy">Paiement - Delivrance</h1>
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
        description: 'Ouvrir la delivrance apres la cloture de la demonstration / inspection.',
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
    { label: 'Certificat', value: bundle?.certificate?.reference ?? 'Non cree' },
    {
      label: 'Cycle',
      value: bundle?.certificate?.collectedAt
        ? 'Retire'
        : bundle?.certificate?.notifiedAt
          ? 'Postulant notifie'
          : bundle?.certificate?.status ?? 'Non demarre',
      tone: bundle?.certificate?.collectedAt ? 'success' : 'muted',
    },
  ] as const;

  return (
    <WorkflowCockpit
      requestId={requestId}
      currentCode="M7"
      title="Phase - Delivrance"
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
              La phase de demonstration/inspection doit etre cloturee avant de demarrer la
              delivrance.
            </p>
            <Button onClick={startPhase} disabled={startingPhase}>
              {startingPhase ? 'Demarrage...' : 'Demarrer la Phase - Delivrance'}
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

            {bundle.certificate && (
              <>
                <CertificateFieldsCard
                  requestId={requestId}
                  certificate={bundle.certificate}
                  setActionError={setActionError}
                />
                <ScopeDetailsCard
                  requestId={requestId}
                  certificate={bundle.certificate}
                  setActionError={setActionError}
                />
                <LifecycleCard
                  requestId={requestId}
                  certificate={bundle.certificate}
                  paymentValidated={bundle.payment?.status === 'validated'}
                  setActionError={setActionError}
                />
              </>
            )}
          </>
        )}
      </div>
    </WorkflowCockpit>
  );
}
