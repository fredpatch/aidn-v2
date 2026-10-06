import type { RequestView } from '../../lib/api/requests.types';
import { CIRCUIT_STATUS_LABELS, STATUS_LABELS, labelOf } from '../../pages/requests/constants';
import { isTerminalDossier } from '../../pages/requests/progress';

const TONES: Record<string, string> = {
  completed: 'bg-anac-success/10 text-anac-success',
  rejected: 'bg-anac-danger/10 text-anac-danger',
  cancelled: 'bg-anac-gray text-anac-muted',
};

/** Global dossier status: the circuit step while in intake, the outcome once terminal. */
export function dossierStatusLabel(request: Pick<RequestView, 'status' | 'circuitStatus'>): string {
  if (isTerminalDossier(request)) return labelOf(STATUS_LABELS, request.status);
  return CIRCUIT_STATUS_LABELS[request.circuitStatus ?? ''] ?? labelOf(STATUS_LABELS, request.status);
}

export function DossierStatusBadge({ request }: { request: Pick<RequestView, 'status' | 'circuitStatus'> }) {
  return (
    <span
      className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${
        TONES[request.status] ?? 'bg-anac-info/10 text-anac-info'
      }`}
    >
      {dossierStatusLabel(request)}
    </span>
  );
}
