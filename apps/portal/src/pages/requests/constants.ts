export const API_ORIGIN = 'http://localhost:4000';

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: "Reconnaissance d'agrément",
  issuance: "Délivrance d'agrément",
  modification: "Modification d'agrément",
  renewal: "Renouvellement d'agrément",
};

export const CIRCUIT_STATUS_LABELS: Record<string, string> = {
  submitted: 'Déposée — en attente de signature DG',
  signed: 'Signée par la DG',
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

export const TERMINAL_STATUSES = ['rejected', 'completed', 'cancelled'];
