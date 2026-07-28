export const API_ORIGIN = 'http://localhost:4000';

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: "Reconnaissance d'agrement",
  issuance: "Delivrance d'agrement",
  modification: "Modification d'agrement",
  renewal: "Renouvellement d'agrement",
};

export const CIRCUIT_STATUS_LABELS: Record<string, string> = {
  submitted: 'Deposee',
  in_signature_circuit: 'En signature',
  signed: 'Signee',
  pending_review: 'Transmise a la Direction de la Navigabilite',
};

export const STATUS_LABELS: Record<string, string> = {
  submitted: 'Deposee',
  signed: 'Signee',
  pending_review: 'En attente de traitement',
  in_progress: 'En cours de traitement',
  rejected: 'Rejetee',
  completed: 'Terminee',
  cancelled: 'Annulee',
};

export const MEETING_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Planifiee',
  held: 'Tenue',
  no_show: 'Absence constatee',
  rescheduled: 'Reprogrammee',
  file_cancelled: 'Dossier annule',
};

export const TERMINAL_STATUSES = ['rejected', 'completed', 'cancelled'];
