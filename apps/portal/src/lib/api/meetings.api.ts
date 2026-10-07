import { api } from '../axios';

/** Mirrors ApplicantMeetingItem (API, GET /meetings/mine). */
export interface ApplicantMeeting {
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
  ticketAvailable: boolean;
}

export async function fetchMyMeetings(): Promise<ApplicantMeeting[]> {
  const { data } = await api.get('/meetings/mine');
  return data;
}

/** Invitation PDF, served by the API with an ownership check. */
export function meetingTicketHref(meetingId: number): string {
  return `/api/meetings/${meetingId}/ticket`;
}
