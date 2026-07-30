export type MeetingTypeFilter = 'all' | 'preliminary' | 'formal' | 'site_visit';
export type MeetingStatusFilter =
  | 'all'
  | 'scheduled'
  | 'held'
  | 'no_show'
  | 'rescheduled'
  | 'file_cancelled';
export type MeetingPhaseFilter = 'all' | 'M3' | 'M4' | 'M6';

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
  ticketUrl: string;
  phaseHref: string;
  canManage: boolean;
  actionLabel: string;
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
