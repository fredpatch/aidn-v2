export const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: "Reconnaissance d'agrément",
  issuance: "Délivrance d'agrément",
  modification: "Modification d'agrément",
  renewal: "Renouvellement d'agrément",
};

export const CIRCUIT_STATUS_LABELS: Record<string, string> = {
  submitted: 'Déposée',
  in_signature_circuit: 'En signature',
  signed: 'Signée',
  pending_review: 'Transmise à la Direction de la Navigabilité',
};

export const STATUS_LABELS: Record<string, string> = {
  submitted: 'Déposée',
  signed: 'Signée',
  pending_review: 'En attente de traitement',
  in_progress: 'En cours de traitement',
  rejected: 'Rejetée',
  completed: 'Terminée',
  cancelled: 'Annulée',
};

export const MEETING_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Planifiée',
  held: 'Tenue',
  no_show: 'Absence constatée',
  rescheduled: 'Reprogrammée',
  file_cancelled: 'Dossier annulé',
};

/** payment_proof_status (shared by M5 / M6 / M7 payments). */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  awaiting_invoice: 'Facture en préparation',
  awaiting_proof: 'Quittance attendue',
  pending_validation: 'Quittance en validation',
  validated: 'Paiement validé',
  rejected: 'Quittance rejetée',
};

export const TERMINAL_STATUSES = ['rejected', 'completed', 'cancelled'];

/**
 * Resolve a backend code to its French label. Never echoes the raw code:
 * an unmapped or empty value renders the fallback instead.
 */
export function labelOf(
  labels: Record<string, string>,
  value: string | null | undefined,
  fallback = 'Non renseigné',
): string {
  if (!value) return fallback;
  return labels[value] ?? fallback;
}
