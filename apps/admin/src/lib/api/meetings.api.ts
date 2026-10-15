import { api } from '../axios';
import type {
  MeetingConfirmationFilter,
  MeetingCockpitSummary,
  MeetingPhaseFilter,
  MeetingStatusFilter,
  MeetingTypeFilter,
} from './meetings.types';

export async function fetchMeetingCockpit(params: {
  from: string;
  to: string;
  meetingType?: MeetingTypeFilter;
  status?: MeetingStatusFilter;
  phaseCode?: MeetingPhaseFilter;
  confirmation?: MeetingConfirmationFilter;
}): Promise<MeetingCockpitSummary> {
  const { data } = await api.get('/meetings', { params });
  return data;
}

export async function markMeetingStatus(
  meetingId: number,
  status: 'held' | 'no_show' | 'file_cancelled'
): Promise<void> {
  await api.patch(`/meetings/${meetingId}/status`, { status });
}

export async function rescheduleMeeting(
  meetingId: number,
  newScheduledAt: string
): Promise<void> {
  await api.post(`/meetings/${meetingId}/reschedule`, { newScheduledAt });
}

export async function attachMeetingReport(meetingId: number, uploadAssetId: number): Promise<void> {
  await api.post(`/meetings/${meetingId}/report`, { uploadAssetId });
}


// SESSION1-MEET-1 - DN side of the negotiation (explicit commands).
export async function acceptMeetingAlternate(meetingId: number): Promise<{ softOverlapWarning: boolean }> {
  const { data } = await api.post(`/meetings/${meetingId}/alternate/accept`);
  return { softOverlapWarning: !!data?.softOverlapWarning };
}

export async function refuseMeetingAlternate(meetingId: number, reason: string): Promise<void> {
  await api.post(`/meetings/${meetingId}/alternate/refuse`, { reason });
}

export async function confirmMeetingOnBehalf(meetingId: number, note: string): Promise<void> {
  await api.post(`/meetings/${meetingId}/confirm-on-behalf`, { note });
}
