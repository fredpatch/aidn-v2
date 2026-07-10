export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'En attente de facture',
  awaiting_proof: 'Facture envoyée - en attente de preuve de paiement',
  pending_validation: 'Preuve soumise - en attente de validation',
  validated: 'Paiement validé',
  rejected: 'Paiement rejeté',
};

export const PAYMENT_STATUS_TONES: Record<string, string> = {
  pending: 'bg-anac-muted/10 text-anac-muted',
  awaiting_proof: 'bg-anac-info/10 text-anac-info',
  pending_validation: 'bg-anac-warning/10 text-anac-warning',
  validated: 'bg-anac-success/10 text-anac-success',
  rejected: 'bg-anac-danger/10 text-anac-danger',
};

export const VERDICT_LABELS: Record<string, string> = {
  validated: 'Validé',
  rejected: 'Rejeté',
  needs_correction: 'À corriger',
};

export const VERDICT_TONES: Record<string, string> = {
  validated: 'bg-anac-success/10 text-anac-success',
  rejected: 'bg-anac-danger/10 text-anac-danger',
  needs_correction: 'bg-anac-warning/10 text-anac-warning',
};

export const API_ORIGIN = 'http://localhost:4000';
