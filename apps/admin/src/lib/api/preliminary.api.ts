import { api } from '../axios';
import type { PreliminaryBundle } from './preliminary.types';

export async function fetchPreliminaryBundle(requestId: string): Promise<PreliminaryBundle> {
  const { data } = await api.get(`/preliminary-evaluation/by-request/${requestId}`);
  return data;
}

export async function startPreliminaryPhase(requestId: string): Promise<void> {
  await api.post(`/phases/requests/${requestId}/start-preliminary-phase`);
}

export async function scheduleMeeting(params: {
  phaseId: number;
  dnAgentId: number;
  scheduledAtIso: string;
  location?: string;
}): Promise<{ softOverlapWarning: boolean }> {
  const { data } = await api.post('/meetings', {
    phaseId: params.phaseId,
    meetingType: 'preliminary',
    dnAgentId: params.dnAgentId,
    scheduledAt: params.scheduledAtIso,
    location: params.location || undefined,
  });
  return data;
}

export async function rescheduleMeeting(
  meetingId: number,
  newScheduledAtIso: string
): Promise<void> {
  await api.post(`/meetings/${meetingId}/reschedule`, { newScheduledAt: newScheduledAtIso });
}

export async function markMeetingStatus(
  meetingId: number,
  status: 'held' | 'no_show' | 'file_cancelled'
): Promise<void> {
  await api.patch(`/meetings/${meetingId}/status`, { status });
}

export async function attachMeetingReport(meetingId: number, uploadAssetId: number): Promise<void> {
  await api.post(`/meetings/${meetingId}/report`, { uploadAssetId });
}

export async function makeDeclarationAvailable(
  phaseId: number,
  returnDays?: number
): Promise<void> {
  await api.post(`/preliminary-evaluation/${phaseId}/make-available`, {
    returnDays,
  });
}

export async function closePhase(params: {
  phaseId: number;
  closureNote?: string;
  closureDocumentUploadAssetId?: number;
}): Promise<void> {
  await api.post(`/phases/${params.phaseId}/close`, {
    closureDocumentUploadAssetId: params.closureDocumentUploadAssetId,
    closureNote: params.closureNote || undefined,
  });
}

// STORAGE-0B - one shared upload helper (returns uploadAssetId).
export { uploadFile } from '../uploads';
