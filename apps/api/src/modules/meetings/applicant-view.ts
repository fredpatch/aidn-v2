import type { ApplicantNegotiationBlock } from './meeting-negotiation.view.js';
import type { MeetingView } from './meetings.types.js';

/** What an applicant may see of one meeting: no internal staff id (for a site
 *  visit, dnAgentId holds the assigned R3 agent - same rule as the M6 bundle),
 *  plus the SESSION1-MEET-1 negotiation block (never the DN's notes). */
export interface ApplicantMeetingView extends ApplicantNegotiationBlock {
  id: number;
  phaseId: number;
  meetingType: string;
  scheduledAt: Date;
  location: string | null;
  status: string;
  crDocumentUrl: string | null;
  crUploadedAt: Date | null;
  createdAt: Date;
}

/** Fields are whitelisted: a field added to MeetingView or to the block later
 *  stays hidden until it is listed here. */
export function toApplicantMeetingView(view: MeetingView, block: ApplicantNegotiationBlock): ApplicantMeetingView {
  return {
    id: view.id,
    phaseId: view.phaseId,
    meetingType: view.meetingType,
    scheduledAt: view.scheduledAt,
    location: view.location,
    status: view.status,
    crDocumentUrl: view.crDocumentUrl,
    crUploadedAt: view.crUploadedAt,
    createdAt: view.createdAt,
    confirmationStatus: block.confirmationStatus,
    confirmedAt: block.confirmedAt,
    alternate: block.alternate,
    lastRefusal: block.lastRefusal,
    actions: block.actions,
    ticketAvailable: block.ticketAvailable,
  };
}
