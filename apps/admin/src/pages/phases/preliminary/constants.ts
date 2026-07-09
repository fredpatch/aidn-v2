export const PHASE_ROADMAP = [
  { code: 'M3', label: 'Phase Preliminaire' },
  { code: 'M4', label: 'Demande Formelle' },
  { code: 'M5', label: 'Evaluation Approfondie' },
  { code: 'M6', label: 'Demonstration / Inspection' },
  { code: 'M7', label: 'Delivrance' },
] as const;

export const API_ORIGIN = 'http://localhost:4000';

export const MEETING_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Planifiee',
  held: 'Tenue',
  no_show: 'Absence constatee',
  rescheduled: 'Reprogrammee',
  file_cancelled: 'Dossier annule',
};

export const MEETING_STATUS_TONES: Record<string, string> = {
  scheduled: 'bg-anac-info/10 text-anac-info',
  held: 'bg-anac-success/10 text-anac-success',
  no_show: 'bg-anac-warning/10 text-anac-warning',
  rescheduled: 'bg-anac-muted/10 text-anac-muted',
  file_cancelled: 'bg-anac-danger/10 text-anac-danger',
};
