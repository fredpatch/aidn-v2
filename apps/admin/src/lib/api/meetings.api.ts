import { api } from '../axios';
import type {
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

