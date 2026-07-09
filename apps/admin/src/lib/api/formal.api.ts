import { api } from '../axios';
import type { FormalPhaseBundle, UploadedFile } from './formal.types';

export async function fetchFormalBundle(requestId: string): Promise<FormalPhaseBundle> {
  const { data } = await api.get(`/formal-request/by-request/${requestId}`);
  return data;
}

export async function startFormalPhase(requestId: string): Promise<void> {
  await api.post(`/formal-request/requests/${requestId}/start-formal-phase`);
}

export async function submitFormalLetter(
  requestId: string,
  fileUrl: string,
  mimeType: string
): Promise<void> {
  await api.post(`/formal-request/requests/${requestId}/letter`, { fileUrl, mimeType });
}

export async function markLetterSigned(requestId: string): Promise<void> {
  await api.post(`/formal-request/requests/${requestId}/letter/mark-signed`);
}

export async function markLetterPendingReview(requestId: string): Promise<void> {
  await api.post(`/formal-request/requests/${requestId}/letter/mark-pending-review`);
}

export async function submitFormalDocument(
  requestId: string,
  slot: string,
  fileUrl: string,
  mimeType: string
): Promise<void> {
  await api.post(`/formal-request/requests/${requestId}/documents`, { slot, fileUrl, mimeType });
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

export async function attachMeetingReport(
  meetingId: number,
  reportFileUrl: string,
  reportMimeType: string
): Promise<void> {
  await api.post(`/meetings/${meetingId}/report`, {
    fileUrl: reportFileUrl,
    mimeType: reportMimeType,
  });
}

export async function closeFormalPhase(params: {
  phaseId: number;
  closureNote?: string;
  closureDocumentUrl?: string;
  closureDocumentMimeType?: string;
}): Promise<void> {
  await api.post(`/formal-request/phases/${params.phaseId}/close`, {
    closureDocumentUrl: params.closureDocumentUrl,
    closureDocumentMimeType: params.closureDocumentMimeType,
    closureNote: params.closureNote || undefined,
  });
}

export async function uploadFile(file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
