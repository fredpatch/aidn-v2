export interface ScheduleMeetingParams {
  phaseId: number;
  meetingType: 'preliminary' | 'formal' | 'site_visit';
  dnAgentId: number;
  scheduledAt: string; // ISO
  location?: string;
}

export interface MeetingView {
  id: number;
  phaseId: number;
  meetingType: string;
  dnAgentId: number;
  scheduledAt: Date;
  location: string | null;
  status: string;
  crDocumentUrl: string | null;
  crUploadedAt: Date | null;
  createdAt: Date;
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
  ticketUrl: string;
  phaseHref: string;
  canManage: boolean;
  actionLabel: string;
}

export interface MeetingCockpitMetric {
  key: string;
  label: string;
  value: number | string;
  helper: string;
  tone: 'info' | 'warning' | 'success' | 'danger';
}

export interface MeetingCockpitSummary {
  periodStart: string;
  periodEnd: string;
  metrics: MeetingCockpitMetric[];
  items: MeetingCockpitItem[];
  upcoming: MeetingCockpitItem[];
  missingReports: MeetingCockpitItem[];
  updatedAt: string;
}

/** One meeting as the applicant sees it (GET /meetings/mine). Deliberately
 *  narrower than MeetingView / MeetingCockpitItem: no DN or R3 agent id, no
 *  organisation-wide data - only what the portal shows. */
export interface ApplicantMeetingItem {
  id: number;
  meetingType: 'preliminary' | 'formal' | 'site_visit';
  status: string;
  scheduledAt: string; // ISO
  location: string | null;
  phaseCode: string;
  requestId: number;
  requestReference: string;
  requestType: string;
  /** Compte-rendu address, when the DN attached one (same field the phase bundles expose). */
  crDocumentUrl: string | null;
  /** The invitation ticket is offered only for a meeting still to come. */
  ticketAvailable: boolean;
}
