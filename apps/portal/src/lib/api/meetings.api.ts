import { api } from '../axios';

/** SESSION1-MEET-1 - mirrors the API ApplicantNegotiationBlock: present on
 *  every applicant meeting payload (Mes réunions, M3 / M4 bundles). */
export type MeetingConfirmationStatus = 'awaiting_applicant' | 'awaiting_dn' | 'confirmed' | 'not_required';

export interface MeetingConfirmationBlock {
  confirmationStatus: MeetingConfirmationStatus;
  confirmedAt: string | null;
  /** Your own pending counter-proposal (awaiting_dn only). */
  alternate: { scheduledAt: string; remark: string } | null;
  /** Latest DN refusal, while it is your turn to answer again. */
  lastRefusal: { reason: string; proposedSlotAt: string; refusedAt: string } | null;
  actions: Array<'confirm' | 'propose_alternate'>;
  /** The invitation PDF exists only for a confirmed appointment. */
  ticketAvailable: boolean;
}

/** Mirrors ApplicantMeetingItem (API, GET /meetings/mine). */
export interface ApplicantMeeting extends MeetingConfirmationBlock {
  id: number;
  meetingType: 'preliminary' | 'formal' | 'site_visit';
  status: string;
  scheduledAt: string;
  location: string | null;
  phaseCode: string;
  requestId: number;
  requestReference: string;
  requestType: string;
  crDocumentUrl: string | null;
}

export async function fetchMyMeetings(): Promise<ApplicantMeeting[]> {
  const { data } = await api.get('/meetings/mine');
  return data;
}

/** Invitation PDF, served by the API with an ownership check. */
export function meetingTicketHref(meetingId: number): string {
  return `/api/meetings/${meetingId}/ticket`;
}

/** SESSION1-MEET-1 - the applicant confirms the proposed appointment. */
export async function confirmMeeting(meetingId: number): Promise<void> {
  await api.post(`/meetings/${meetingId}/confirm`);
}

/** SESSION1-MEET-1 - another exact date-time (ISO with offset) + a remark. */
export async function proposeMeetingAlternate(meetingId: number, scheduledAt: string, remark: string): Promise<void> {
  await api.post(`/meetings/${meetingId}/propose-alternate`, { scheduledAt, remark });
}
