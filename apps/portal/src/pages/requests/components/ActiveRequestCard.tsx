import { useState } from 'react';
import { apiErrorMessage } from '../../../lib/axios';
import { notify } from '../../../lib/notify';
import { cancelMyRequest } from '../../../lib/api/requests.api';
import type { RequestView } from '../../../lib/api/requests.types';
import { CIRCUIT_STATUS_LABELS, REQUEST_TYPE_LABELS, STATUS_LABELS } from '../constants';
import { FormalPhaseSection } from './FormalPhaseSection';
import { PreliminaryPhaseSection } from './PreliminaryPhaseSection';
import { DeepEvaluationSection } from './DeepEvaluationSection';

export function ActiveRequestCard({
  request,
  onChanged,
}: {
  request: RequestView;
  onChanged: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCancel = request.circuitStatus === 'submitted';

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

  const statusLabel =
    CIRCUIT_STATUS_LABELS[request.circuitStatus ?? ''] ??
    STATUS_LABELS[request.status] ??
    request.status;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-anac-navy">{request.reference}</span>
        <span className="text-xs text-anac-muted">
          {REQUEST_TYPE_LABELS[request.requestType] ?? request.requestType}
        </span>
      </div>

      <p className="text-sm">
        Statut : <span className="font-medium">{statusLabel}</span>
      </p>

      {error && <p className="text-anac-danger text-sm">{error}</p>}

      {canCancel && (
        <button className="btn-secondary text-sm" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? 'Annulation...' : 'Annuler ma demande'}
        </button>
      )}

      {!canCancel && request.status !== 'in_progress' && (
        <p className="text-anac-muted text-xs">
          Cette demande ne peut plus être annulée (déjà transmise à la DG ou au-delà).
        </p>
      )}

      {(request.circuitStatus === 'pending_review' || request.status === 'in_progress') && (
        <PreliminaryPhaseSection requestId={request.id} />
      )}

      {request.status === 'in_progress' && <FormalPhaseSection requestId={request.id} />}

      {request.status === 'in_progress' && <DeepEvaluationSection requestId={request.id} />}
    </div>
  );
}
