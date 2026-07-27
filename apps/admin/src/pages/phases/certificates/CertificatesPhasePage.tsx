import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import PhaseSidebar from '../preliminary/components/PhaseSidebar';
import PhaseStatusBadge from '../preliminary/components/PhaseStatusBadge';
import PaymentCard from './components/PaymentCard';
import CertificateFieldsCard from './components/CertificateFieldsCard';
import ScopeDetailsCard from './components/ScopeDetailsCard';
import LifecycleCard from './components/LifecycleCard';
import { buildChecklist } from './helpers';
import { useCertificateBundle } from './hooks/useCertificateBundle';

export default function CertificatesPhasePage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();

  const [actionError, setActionError] = useState<string | null>(null);

  const { bundle, loading, error, startPhase, startingPhase } = useCertificateBundle(
    requestId,
    setActionError
  );

  if (loading) return <p className="text-anac-muted p-6">Chargement...</p>;
  if (error) return <p className="text-anac-danger p-6">{error}</p>;

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
          currentCode="M7"
          checklistTitle="Checklist — Délivrance"
          checklist={checklist}
        />
      </div>

      {/* Right column */}
      <div className="flex-1 min-w-0 space-y-6">
        <div>
          <h1 className="text-anac-navy text-xl font-semibold">Phase — Délivrance et Certificats</h1>
          <p className="text-anac-muted text-sm">Demande #{requestId}</p>
        </div>

        {actionError && <p className="text-anac-danger text-sm">{actionError}</p>}

        {!bundle?.phase ? (
          <div className="card">
            <p className="text-anac-muted text-sm mb-3">
              La phase de démonstration/inspection doit être clôturée avant de démarrer la
              délivrance.
            </p>
            <Button onClick={startPhase} disabled={startingPhase}>
              {startingPhase ? 'Démarrage...' : 'Démarrer la Phase — Délivrance'}
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

            <PaymentCard
              requestId={requestId}
              phaseId={bundle.phase.id}
              payment={bundle.payment}
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
    </div>
  );
}
