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

export const CERTIFICATE_STATUS_LABELS: Record<string, string> = {
  in_preparation: 'En préparation',
  printed: 'Imprimé',
  signed: 'Signé',
  archived: 'Archivé',
  notified: 'Postulant notifié',
  collected: 'Retiré',
};

export const CERTIFICATE_STATUS_TONES: Record<string, string> = {
  in_preparation: 'bg-anac-muted/10 text-anac-muted',
  printed: 'bg-anac-info/10 text-anac-info',
  signed: 'bg-anac-info/10 text-anac-info',
  archived: 'bg-anac-warning/10 text-anac-warning',
  notified: 'bg-anac-warning/10 text-anac-warning',
  collected: 'bg-anac-success/10 text-anac-success',
};

export const SCOPE_CATEGORY_LABELS: Record<string, string> = {
  aeronefs: "Maintenance d'aéronefs",
  moteurs: 'Maintenance des moteurs',
  composants: 'Maintenance de composants',
  specialisee: 'Maintenance spécialisée',
};

export const API_ORIGIN = 'http://localhost:4000';
