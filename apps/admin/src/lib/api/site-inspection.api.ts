import { api } from '../axios';
import type {
  SiteInspectionBundle,
  MyQueueItem,
  PaymentQueueItem,
  UploadedFile,
} from './site-inspection.types';

export async function fetchSiteInspectionBundle(requestId: string): Promise<SiteInspectionBundle> {
  const { data } = await api.get(`/site-inspection/by-request/${requestId}`);
  return data;
}

export async function startSiteInspection(requestId: string): Promise<void> {
  await api.post(`/site-inspection/requests/${requestId}/start-site-inspection`);
}

export async function uploadInvoice(
  phaseId: number,
  fileUrl: string,
  mimeType: string,
  uploadAssetId?: number
): Promise<void> {
  await api.post(`/site-inspection/phases/${phaseId}/invoice`, { fileUrl, mimeType, uploadAssetId });
}

export async function uploadPaymentProof(
  phaseId: number,
  requestId: string,
  fileUrl: string,
  mimeType: string,
  uploadAssetId?: number
): Promise<void> {
  await api.post(`/site-inspection/phases/${phaseId}/requests/${requestId}/proof`, {
    fileUrl,
    mimeType,
    uploadAssetId,
  });
}

export async function validatePayment(phaseId: number): Promise<void> {
  await api.post(`/site-inspection/phases/${phaseId}/payment/validate`);
}

export async function rejectPayment(
  phaseId: number,
  rejectionAction: 'request_new_proof' | 'reject_dossier',
  rejectionReason: string
): Promise<void> {
  await api.post(`/site-inspection/phases/${phaseId}/payment/reject`, {
    rejectionAction,
    rejectionReason,
  });
}

export async function scheduleSiteVisit(params: {
  phaseId: number;
  r3AgentId: number;
  scheduledAt: string;
  location?: string;
}): Promise<{ softOverlapWarning: boolean }> {
  const { data } = await api.post(`/site-inspection/phases/${params.phaseId}/site-visit`, {
    r3AgentId: params.r3AgentId,
    scheduledAt: params.scheduledAt,
    location: params.location,
  });
  return { softOverlapWarning: data.softOverlapWarning };
}

// Reuses the shared meetings module's status endpoint — a site visit is a
// meeting under the hood (meetingType: 'site_visit').
export async function markSiteVisitHeld(meetingId: number): Promise<void> {
  await api.patch(`/site-inspection/site-visits/${meetingId}/held`);
}

export async function submitVerdict(
  phaseId: number,
  verdict: 'compliant' | 'non_compliant' | 'compliant_with_reserves',
  note: string
): Promise<void> {
  await api.post(`/site-inspection/phases/${phaseId}/verdict`, { verdict, note });
}

export async function fetchMyQueue(): Promise<MyQueueItem[]> {
  const { data } = await api.get('/site-inspection/my-queue');
  return data;
}

export async function fetchSiteInspectionPaymentQueue(): Promise<PaymentQueueItem[]> {
  const { data } = await api.get('/site-inspection/payment-queue');
  return data;
}

export async function fetchUsersByRole(
  role: string
): Promise<{ id: number; fullName: string; employeeCode: string }[]> {
  const { data } = await api.get(`/users/by-role/${role}`);
  return data;
}

export async function uploadFile(file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
