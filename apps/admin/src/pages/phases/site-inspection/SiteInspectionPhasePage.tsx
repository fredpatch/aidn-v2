import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import PhaseSidebar from '../preliminary/components/PhaseSidebar';
import PhaseStatusBadge from '../preliminary/components/PhaseStatusBadge';
import PaymentCard from './components/PaymentCard';
import SiteVisitCard from './components/SiteVisitCard';
import VerdictCard from './components/VerdictCard';
import { buildChecklist } from './helpers';
import { useSiteInspectionBundle } from './hooks/useSiteInspectionBundle';

export default function SiteInspectionPhasePage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();

  const [actionError, setActionError] = useState<string | null>(null);

  const { bundle, loading, error, startPhase, startingPhase } = useSiteInspectionBundle(
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
          currentCode="M6"
          checklistTitle="Checklist — Démonstration / Inspection"
          checklist={checklist}
        />
      </div>

      {/* Right column */}
      <div className="flex-1 min-w-0 space-y-6">
        <div>
          <h1 className="text-anac-navy text-xl font-semibold">
            Phase — Démonstration et Inspection sur Site
          </h1>
          <p className="text-anac-muted text-sm">Demande #{requestId}</p>
        </div>

        {actionError && <p className="text-anac-danger text-sm">{actionError}</p>}

        {!bundle?.phase ? (
          <div className="card">
            <p className="text-anac-muted text-sm mb-3">
              La phase d&apos;évaluation approfondie doit être clôturée avant de démarrer la
              démonstration/inspection.
            </p>
            <Button onClick={startPhase} disabled={startingPhase}>
              {startingPhase ? 'Démarrage...' : 'Démarrer la Phase — Démonstration/Inspection'}
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

            <SiteVisitCard
              phaseId={bundle.phase.id}
              siteVisit={bundle.siteVisit}
              requestId={requestId}
              invoiceSent={!!bundle.payment?.invoiceFileUrl}
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
    </div>
  );
}
