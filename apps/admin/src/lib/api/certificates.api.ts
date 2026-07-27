import { api } from '../axios';
import type { CertificateBundle, ScopeDetails, UploadedFile } from './certificates.types';

export async function fetchCertificateBundle(requestId: string): Promise<CertificateBundle> {
  const { data } = await api.get(`/certificates/by-request/${requestId}`);
  return data;
}

export async function startDelivery(requestId: string): Promise<void> {
  await api.post(`/certificates/requests/${requestId}/start-delivery`);
}

export async function uploadInvoice(
  phaseId: number,
  fileUrl: string,
  mimeType: string,
  uploadAssetId?: number
): Promise<void> {
  await api.post(`/certificates/phases/${phaseId}/invoice`, { fileUrl, mimeType, uploadAssetId });
}

export async function uploadPaymentProof(
  phaseId: number,
  requestId: string,
  fileUrl: string,
  mimeType: string,
  uploadAssetId?: number
): Promise<void> {
  await api.post(`/certificates/phases/${phaseId}/requests/${requestId}/proof`, {
    fileUrl,
    mimeType,
    uploadAssetId,
  });
}

export async function validatePayment(phaseId: number): Promise<void> {
  await api.post(`/certificates/phases/${phaseId}/payment/validate`);
}

export async function rejectPayment(
  phaseId: number,
  rejectionAction: 'request_new_proof' | 'reject_dossier',
  rejectionReason: string
): Promise<void> {
  await api.post(`/certificates/phases/${phaseId}/payment/reject`, {
    rejectionAction,
    rejectionReason,
  });
}

export interface CertificateFieldsInput {
  approvalReferenceNumber?: string;
  expiresAt?: string;
  initialIssueDate?: string;
  currentIssueDate?: string;
  dgFullNameOverride?: string;
  scopeDetails?: ScopeDetails;
}

export async function updateCertificateFields(
  certificateId: number,
  fields: CertificateFieldsInput
): Promise<void> {
  await api.patch(`/certificates/${certificateId}/fields`, fields);
}

export async function overrideCertificateType(
  certificateId: number,
  certificateType: 'agreement' | 'recognition'
): Promise<void> {
  await api.post(`/certificates/${certificateId}/type`, { certificateType });
}

export async function generateCertificateDocument(
  certificateId: number
): Promise<{ fileUrl: string }> {
  const { data } = await api.post(`/certificates/${certificateId}/generate`);
  return data;
}

export async function markPrinted(certificateId: number): Promise<void> {
  await api.post(`/certificates/${certificateId}/printed`);
}
export async function markSigned(certificateId: number): Promise<void> {
  await api.post(`/certificates/${certificateId}/signed`);
}
export async function markArchived(certificateId: number): Promise<void> {
  await api.post(`/certificates/${certificateId}/archived`);
}
export async function notifyApplicant(certificateId: number): Promise<void> {
  await api.post(`/certificates/${certificateId}/notify`);
}
export async function markCollected(certificateId: number): Promise<void> {
  await api.post(`/certificates/${certificateId}/collected`);
}

export async function uploadFile(file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
