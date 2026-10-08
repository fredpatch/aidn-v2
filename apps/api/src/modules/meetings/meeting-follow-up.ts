/** K6 - which held meetings still call for someone's action. One rule for the
 *  Réunions cockpit and the analytics overview (they disagreed: analytics
 *  counted site visits as "without a report", which can never get one).
 *
 *  Decisions (Fred, 2026-10-08):
 *  - the compte-rendu is optional (often sent by Outlook): preliminary and
 *    formal meetings without one are listed for information, not as alerts;
 *  - a site visit has no compte-rendu: its output is the R3 opinion, followed
 *    in its own list;
 *  - only active dossiers count: on a completed, cancelled or rejected
 *    dossier nothing is left to do, and the indicator must be able to reach 0. */

import { isDossierClosed } from '../requests/dossier-open.js';

type MeetingType = 'preliminary' | 'formal' | 'site_visit';

export interface FollowUpMeeting {
  meetingType: MeetingType;
  status: string;
  crDocumentUrl: string | null;
}

/** Same definition as the K7 write guard: one list of closed statuses. */
export function isActiveDossier(requestStatus: string): boolean {
  return !isDossierClosed(requestStatus);
}

/** A preliminary or formal meeting held on an active dossier, no compte-rendu. */
export function lacksMeetingReport(meeting: FollowUpMeeting, requestStatus: string): boolean {
  return (
    meeting.meetingType !== 'site_visit' &&
    meeting.status === 'held' &&
    !meeting.crDocumentUrl &&
    isActiveDossier(requestStatus)
  );
}

/** A site visit held on an active dossier whose R3 opinion is not submitted. */
export function awaitsR3Opinion(
  meeting: FollowUpMeeting,
  requestStatus: string,
  opinionSubmitted: boolean
): boolean {
  return (
    meeting.meetingType === 'site_visit' &&
    meeting.status === 'held' &&
    !opinionSubmitted &&
    isActiveDossier(requestStatus)
  );
}
