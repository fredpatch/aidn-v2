import { api } from '../../../lib/axios';
import type { PreliminaryBundle, UploadedFile } from './types';

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
  closureDocumentUrl?: string;
  closureDocumentMimeType?: string;
}): Promise<void> {
  await api.post(`/phases/${params.phaseId}/close`, {
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
