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
  /** DOSSIER-CONTEXT-UX-1 - which dossier the page is about (null for a role
   *  that cannot open a phase page). */
  identity?: DossierIdentity | null;
}

export interface DossierIdentity {
  reference: string;
  organisationName: string;
  applicantName: string | null;
  /** Same label as the Demandes reading pane. */
  statusLabel: string;
}
