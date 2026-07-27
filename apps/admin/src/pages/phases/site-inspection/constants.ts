export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  awaiting_invoice: 'En attente de facture',
  awaiting_proof: 'Facture envoyée - en attente de preuve de paiement',
  pending_validation: 'Preuve soumise - en attente de validation',
  validated: 'Paiement validé',
  rejected: 'Paiement rejeté',
};

export const PAYMENT_STATUS_TONES: Record<string, string> = {
  awaiting_invoice: 'bg-anac-muted/10 text-anac-muted',
  awaiting_proof: 'bg-anac-info/10 text-anac-info',
  pending_validation: 'bg-anac-warning/10 text-anac-warning',
  validated: 'bg-anac-success/10 text-anac-success',
  rejected: 'bg-anac-danger/10 text-anac-danger',
};

export const SITE_VISIT_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Planifiée',
  held: 'Tenue',
  no_show: 'Absence constatée',
  rescheduled: 'Reprogrammée',
  file_cancelled: 'Dossier annulé',
};

export const SITE_VISIT_STATUS_TONES: Record<string, string> = {
  scheduled: 'bg-anac-info/10 text-anac-info',
  held: 'bg-anac-success/10 text-anac-success',
  no_show: 'bg-anac-danger/10 text-anac-danger',
  rescheduled: 'bg-anac-warning/10 text-anac-warning',
  file_cancelled: 'bg-anac-muted/10 text-anac-muted',
};

export const VERDICT_LABELS: Record<string, string> = {
  compliant: 'Conforme',
  non_compliant: 'Non conforme',
  compliant_with_reserves: 'Conforme avec réserves',
};

export const VERDICT_TONES: Record<string, string> = {
  compliant: 'bg-anac-success/10 text-anac-success',
  non_compliant: 'bg-anac-danger/10 text-anac-danger',
  compliant_with_reserves: 'bg-anac-warning/10 text-anac-warning',
};

export const API_ORIGIN = 'http://localhost:4000';
