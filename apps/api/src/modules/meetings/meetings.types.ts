import type { ApplicantNegotiationBlock, MeetingNegotiationView } from './meeting-negotiation.view.js';

export interface ScheduleMeetingParams {
  phaseId: number;
  meetingType: 'preliminary' | 'formal' | 'site_visit';
  /** Who acts (audit, negotiation history). */
  actorUserId: number;
  /** Who is assigned (DN agent, or the R3 agent for a site visit). */
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
  /** SESSION1-MEET-1 - applicant confirmation (M3/M4); not_required for M6. */
  confirmationStatus: string;
  confirmedAt: Date | null;
  crDocumentUrl: string | null;
  crUploadedAt: Date | null;
  createdAt: Date;
}

/** Staff read of one meeting (GET /meetings/:id). */
export interface StaffMeetingView extends MeetingView {
  negotiation: MeetingNegotiationView;
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
  /** SESSION1-MEET-1 - same shape as in the M3/M4 bundles (no history in lists). */
  negotiation: MeetingNegotiationView;
  /** K7c - closed dossier: canManage is false, actionLabel 'Dossier clos'. */
  dossierStatus: string;
  dossierClosed: boolean;
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
  /** SESSION1-MEET-1 - live M3/M4 meetings waiting on the DN or the applicant,
   *  any date, open dossiers only; counter-proposals first. */
  pendingNegotiations: MeetingCockpitItem[];
  updatedAt: string;
}

/** One meeting as the applicant sees it (GET /meetings/mine). Deliberately
 *  narrower than MeetingView / MeetingCockpitItem: no DN or R3 agent id, no
 *  organisation-wide data - only what the portal shows. */
export interface ApplicantMeetingItem extends ApplicantNegotiationBlock {
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
}
