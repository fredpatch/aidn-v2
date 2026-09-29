import { api } from '../axios';
import type { FormalPhaseBundle } from './formal.types';

export async function fetchFormalBundle(requestId: string): Promise<FormalPhaseBundle> {
  const { data } = await api.get(`/formal-request/by-request/${requestId}`);
  return data;
}

export async function startFormalPhase(requestId: string): Promise<void> {
  await api.post(`/formal-request/requests/${requestId}/start-formal-phase`);
}

/** DN/SU on the applicant's behalf (physical drop-off). */
export async function submitFormalLetter(requestId: string, uploadAssetId: number): Promise<void> {
  await api.post(`/formal-request/requests/${requestId}/letter`, { uploadAssetId });
}

export async function markLetterSigned(requestId: string): Promise<void> {
  await api.post(`/formal-request/requests/${requestId}/letter/mark-signed`);
}

export async function markLetterPendingReview(requestId: string): Promise<void> {
  await api.post(`/formal-request/requests/${requestId}/letter/mark-pending-review`);
}

export async function scheduleFormalMeeting(params: {
  phaseId: number;
  dnAgentId: number;
  scheduledAtIso: string;
  location?: string;
}): Promise<{ softOverlapWarning: boolean }> {
  const { data } = await api.post('/meetings', {
    phaseId: params.phaseId,
    meetingType: 'formal',
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

export async function closeFormalPhase(params: {
  phaseId: number;
  closureNote?: string;
  closureDocumentUploadAssetId?: number;
}): Promise<void> {
  await api.post(`/formal-request/phases/${params.phaseId}/close`, {
    closureDocumentUploadAssetId: params.closureDocumentUploadAssetId,
    closureNote: params.closureNote || undefined,
  });
}

// STORAGE-0B - one shared upload helper (returns uploadAssetId).
export { uploadFile } from '../uploads';
