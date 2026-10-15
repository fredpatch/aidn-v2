export type MeetingTypeFilter = 'all' | 'preliminary' | 'formal' | 'site_visit';
export type MeetingStatusFilter =
  | 'all'
  | 'scheduled'
  | 'held'
  | 'no_show'
  | 'rescheduled'
  | 'file_cancelled';
export type MeetingPhaseFilter = 'all' | 'M3' | 'M4' | 'M6';
export type MeetingConfirmationFilter = 'all' | 'awaiting_applicant' | 'awaiting_dn' | 'confirmed';

/** SESSION1-MEET-1 - mirrors the API MeetingNegotiationView (meetings/meeting-negotiation.view.ts). */
export type MeetingConfirmationStatus = 'awaiting_applicant' | 'awaiting_dn' | 'confirmed' | 'not_required';
export type DnNegotiationAction = 'accept_alternate' | 'refuse_alternate' | 'confirm_on_behalf';

export interface NegotiationEventView {
  kind: string;
  label: string;
  meetingId: number;
  slotAt: string | null;
  remark: string | null;
  reason: string | null;
  actor: { type: 'dn' | 'applicant'; name: string | null };
  createdAt: string;
  resultingMeetingId: number | null;
}

export interface MeetingNegotiationView {
  confirmationStatus: MeetingConfirmationStatus;
  confirmedAt: string | null;
  alternate: { scheduledAt: string; remark: string } | null;
  waitingSince: string | null;
  waitingDays: number | null;
  alternateSlotTaken: boolean;
  availableNegotiationActions: DnNegotiationAction[];
  /** Phase history - detail and M3/M4 bundles only. */
  history?: NegotiationEventView[];
}

/** The appointment stands: confirmed (M3/M4) or no confirmation needed (M6). */
export function isOperationallyConfirmed(negotiation: Pick<MeetingNegotiationView, 'confirmationStatus'>): boolean {
  return negotiation.confirmationStatus === 'confirmed' || negotiation.confirmationStatus === 'not_required';
}

export interface MeetingCockpitMetric {
  key: string;
  label: string;
  value: number | string;
  helper: string;
  tone: 'info' | 'warning' | 'success' | 'danger';
}

export interface MeetingCockpitItem {
  id: number;
  phaseId: number;
  phaseCode: string;
  phaseLabel: string;
  phaseStatus: string;
  requestId: number;
  requestReference: string;
  requestType: string;
  organisationName: string;
  applicantName: string;
  meetingType: string;
  meetingTypeLabel: string;
  status: string;
  statusLabel: string;
  scheduledAt: string;
  location: string | null;
  dnAgentId: number;
  dnAgentName: string;
  crDocumentUrl: string | null;
  crUploadedAt: string | null;
  /** SESSION1-MEET-2 - the applicant's signed return of the CR. */
  signedCrDocumentUrl: string | null;
  signedCrUploadedAt: string | null;
  ticketUrl: string;
  phaseHref: string;
  canManage: boolean;
  actionLabel: string;
  negotiation: MeetingNegotiationView;
  /** K7c - the dossier is closed: listed for history, no action offered. */
  dossierStatus: string;
  dossierClosed: boolean;
}

export interface MeetingCockpitSummary {
  periodStart: string;
  periodEnd: string;
  metrics: MeetingCockpitMetric[];
  items: MeetingCockpitItem[];
  upcoming: MeetingCockpitItem[];
  missingReports: MeetingCockpitItem[];
  /** Live M3/M4 meetings waiting on the DN or the applicant, any date; counter-proposals first. */
  pendingNegotiations: MeetingCockpitItem[];
  updatedAt: string;
}
