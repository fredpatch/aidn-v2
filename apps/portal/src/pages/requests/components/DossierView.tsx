import { useState, type ComponentType } from 'react';
import { apiErrorMessage } from '../../../lib/axios';
import { notify } from '../../../lib/notify';
import { formatDate } from '../../../lib/format';
import { cancelMyRequest } from '../../../lib/api/requests.api';
import type { RequestView } from '../../../lib/api/requests.types';
import type { PhaseCode } from '../../../lib/react-query/queryKeys';
import { REQUEST_TYPE_LABELS, labelOf } from '../constants';
import { DossierStatusBadge } from '../../../components/request/DossierStatusBadge';
import { useDossierProgress } from '../hooks/useDossierProgress';
import { ActionBanner } from '../../../components/request/ActionBanner';
import { PhaseProgress } from '../../../components/request/PhaseProgress';
import { ClosedPhaseRow } from '../../../components/request/ClosedPhaseRow';
import { ReadOnlyProvider } from '../../../components/request/ReadOnlyContext';
import { isTerminalDossier } from '../progress';
import { FormalPhaseSection } from './FormalPhaseSection';
import { PreliminaryPhaseSection } from './PreliminaryPhaseSection';
import { DeepEvaluationSection } from './DeepEvaluationSection';
import { SiteInspectionSection } from './SiteInspectionSection';
import { CertificatesSection } from './CertificatesSection';

const SECTIONS: Record<PhaseCode, ComponentType<{ requestId: number }>> = {
  M3: PreliminaryPhaseSection,
  M4: FormalPhaseSection,
  M5: DeepEvaluationSection,
  M6: SiteInspectionSection,
  M7: CertificatesSection,
};

/**
 * One dossier, active or terminal: header, banner, progress strip, open phases,
 * closed phases. A terminal dossier and every closed phase render read-only.
 */
export function DossierView({
  request,
  onChanged,
}: {
  request: RequestView;
  onChanged: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = useDossierProgress(request);

  const terminal = isTerminalDossier(request);
  const canCancel = !terminal && request.circuitStatus === 'submitted';

  async function handleCancel() {
    setError(null);
    setCancelling(true);
    try {
      await cancelMyRequest(request.id);
      notify.success('Demande annulée.');
      onChanged();
    } catch (err) {
      const message = apiErrorMessage(err, 'Annulation impossible.');
      setError(message);
      notify.error(message);
    } finally {
      setCancelling(false);
    }
  }


  // Open phases (plus failing or still-loading ones, so each resolves on its own)
  // in workflow order; closed phases newest first. Upcoming phases live only in the strip.
  const activeItems = progress.items.filter(
    (item) => item.stage === 'current' || item.stage === 'error' || item.stage === 'loading',
  );
  const closedItems = progress.items.filter((item) => item.stage === 'closed').reverse();
  // Only a first load with nothing known yet gets the page-level message.
  const nothingKnownYet =
    progress.loading && progress.items.every((item) => item.stage === 'loading' || item.stage === 'upcoming');

  return (
    <ReadOnlyProvider readOnly={terminal}>
    <div className="space-y-4">
      <div className="card space-y-3 !p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-anac-navy">{request.reference}</p>
            <p className="text-sm text-anac-muted">
              {labelOf(REQUEST_TYPE_LABELS, request.requestType)} · déposée le {formatDate(request.createdAt)}
            </p>
          </div>
          <DossierStatusBadge request={request} />
        </div>

        {error && <p className="text-anac-danger text-sm">{error}</p>}

        {canCancel && (
          <button className="btn-secondary text-sm" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Annulation...' : 'Annuler ma demande'}
          </button>
        )}

        {!canCancel && !terminal && request.status !== 'in_progress' && (
          <p className="text-anac-muted text-xs">
            Cette demande ne peut plus être annulée (déjà envoyée en signature ou au-delà).
          </p>
        )}
      </div>

      {progress.banner && <ActionBanner banner={progress.banner} />}

      <PhaseProgress items={progress.items} intakeDone={progress.intakeDone} />

      {nothingKnownYet ? (
        <p className="text-sm text-anac-muted">Chargement de votre dossier...</p>
      ) : (
        <>
          {activeItems.map((item) => {
            const Section = SECTIONS[item.code];
            // A loading phase may turn out not opened yet: no card until it is known.
            if (item.stage === 'loading') return <Section key={item.code} requestId={request.id} />;
            return (
              <div key={item.code} className="card !p-4">
                <Section requestId={request.id} />
              </div>
            );
          })}

          {closedItems.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-semibold text-anac-muted">Étapes clôturées</h2>
              <div className="overflow-hidden rounded-lg border border-anac-border bg-white">
                {closedItems.map((item) => {
                  const Section = SECTIONS[item.code];
                  return (
                    <ClosedPhaseRow key={item.code} label={item.label} summary={item.summary}>
                      <ReadOnlyProvider readOnly>
                        <Section requestId={request.id} />
                      </ReadOnlyProvider>
                    </ClosedPhaseRow>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
    </ReadOnlyProvider>
  );
}
