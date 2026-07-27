export interface PhaseSummaryItem {
  phaseCode: 'M3' | 'M4' | 'M5' | 'M6' | 'M7';
  status: 'not_started' | 'open' | 'closed';
  openedAt: string | null;
  closedAt: string | null;
}
