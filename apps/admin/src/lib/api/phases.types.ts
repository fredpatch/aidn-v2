export interface PhaseSummaryItem {
  phaseCode: 'M3' | 'M4' | 'M5' | 'M6' | 'M7';
  status: 'not_started' | 'open' | 'closed';
  openedAt: string | null;
  closedAt: string | null;
}

/** K7b - GET /phases/requests/:id/dossier-state */
export interface DossierState {
  status: string;
  closed: boolean;
  closedAt: string | null;
  rejectionReason: string | null;
}
