/** SESSION1-MEET-1 - the one place that knows which meetings need the
 *  applicant's confirmation and what "confirmed" means operationally.
 *  Other modules call these helpers; they never compare meetingType or
 *  confirmationStatus literals themselves (meeting-confirmation.literals.test.ts).
 *
 *  - preliminary (M3) and formal (M4): the DN proposes, the applicant confirms
 *    or counter-proposes, the DN accepts or refuses;
 *  - site_visit (M6): no negotiation, `not_required` from creation on (the DB
 *    check meetings_type_confirmation_chk enforces the same rule). */
import type { MeetingConfirmationStatus } from '@aidn/shared';

export type MeetingType = 'preliminary' | 'formal' | 'site_visit';

interface ConfirmationState {
  confirmationStatus: string;
}

interface LifecycleState extends ConfirmationState {
  status: string;
}

export function requiresApplicantConfirmation(meetingType: string): boolean {
  return meetingType === 'preliminary' || meetingType === 'formal';
}

/** Status of a meeting the DN creates or reschedules - a NEW proposal. Not
 *  for an accepted counter-proposal, which is created already confirmed. */
export function initialConfirmationStatus(meetingType: string): Extract<
  MeetingConfirmationStatus,
  'awaiting_applicant' | 'not_required'
> {
  return requiresApplicantConfirmation(meetingType) ? 'awaiting_applicant' : 'not_required';
}

/** The appointment stands: confirmed (M3/M4) or no confirmation needed (M6). */
export function isMeetingOperationallyConfirmed(meeting: ConfirmationState): boolean {
  return meeting.confirmationStatus === 'confirmed' || meeting.confirmationStatus === 'not_required';
}

export function isAwaitingApplicant(meeting: ConfirmationState): boolean {
  return meeting.confirmationStatus === 'awaiting_applicant';
}

export function isAwaitingDn(meeting: ConfirmationState): boolean {
  return meeting.confirmationStatus === 'awaiting_dn';
}

/** The applicant may confirm or counter-propose. */
export function canApplicantRespond(meeting: LifecycleState): boolean {
  return meeting.status === 'scheduled' && isAwaitingApplicant(meeting);
}

/** A live meeting whose slot is reserved and whose invitation can be issued. */
export function isConfirmedScheduledMeeting(meeting: LifecycleState): boolean {
  return meeting.status === 'scheduled' && isMeetingOperationallyConfirmed(meeting);
}

/** SESSION1-MEET-2 - M3/M4 have a DN compte-rendu and its signed return; M6
 *  has neither: its output is the Agent CI opinion (K6). Guards both the DN
 *  upload and the applicant's signed copy; the DB check
 *  meetings_signed_cr_coherent_chk enforces the same rule for the copy. */
export function acceptsMeetingReport(meetingType: string): boolean {
  return meetingType === 'preliminary' || meetingType === 'formal';
}

/** Same rule as submitSignedMeetingReport, for the read models: M3/M4, held,
 *  DN CR present, dossier open, and no signed copy yet - the applicant
 *  uploads it once (D3 revised: no direct replacement). */
export function canApplicantSubmitSignedReport(
  meeting: { meetingType: string; status: string; crDocumentUrl: string | null; signedCrDocumentUrl: string | null },
  dossierClosed: boolean
): boolean {
  return (
    !dossierClosed &&
    acceptsMeetingReport(meeting.meetingType) &&
    meeting.status === 'held' &&
    meeting.crDocumentUrl !== null &&
    meeting.signedCrDocumentUrl === null
  );
}
