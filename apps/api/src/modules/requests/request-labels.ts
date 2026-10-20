/** How a dossier is named and qualified for staff: the Demandes reading pane
 *  and the phase pages' dossier context (DOSSIER-CONTEXT-UX-1) share these,
 *  so the same dossier never reads two ways. Pure. */

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: 'Reconnaissance',
  issuance: 'Délivrance',
  modification: 'Modification',
  renewal: 'Renouvellement',
};

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  submitted: 'Déposé',
  signed: 'Signé',
  pending_review: 'En attente de traitement',
  in_progress: 'En cours',
  rejected: 'Rejeté',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

/** Business names of the phases: M3-M7 are technical identifiers. */
export const PHASE_LABELS: Record<string, string> = {
  M3: 'Préliminaire',
  M4: 'Demande formelle',
  M5: 'Évaluation approfondie',
  M6: 'Démonstration / Inspection',
  M7: 'Délivrance',
};

export const TERMINAL_REQUEST_STATUSES = ['rejected', 'completed', 'cancelled'];

/** Effective status: a closed M7 (Délivrance) completes the dossier even if
 *  requests.status was not updated; terminal statuses are kept as stored.
 *  Pure, so the cockpit applies it to the phases it already loaded (D2: no
 *  query per dossier). */
export function effectiveRequestStatus(storedStatus: string, deliveryPhaseStatus: string | null): string {
  if (TERMINAL_REQUEST_STATUSES.includes(storedStatus)) return storedStatus;
  if (deliveryPhaseStatus === 'closed') return 'completed';
  return storedStatus;
}

export function requestStatusLabel(status: string): string {
  return REQUEST_STATUS_LABELS[status] ?? status;
}
