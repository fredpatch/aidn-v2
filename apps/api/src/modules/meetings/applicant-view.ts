import type { MeetingView } from './meetings.types.js';

/** What an applicant may see of one meeting: no internal staff id (for a site
 *  visit, dnAgentId holds the assigned R3 agent - same rule as the M6 bundle). */
export type ApplicantMeetingView = Omit<MeetingView, 'dnAgentId'>;

/** Fields are whitelisted: a field added to MeetingView later stays hidden. */
export function toApplicantMeetingView(view: MeetingView): ApplicantMeetingView {
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
  };
}
