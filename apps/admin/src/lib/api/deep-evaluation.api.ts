import { api } from '../axios';
import type { DeepEvaluationBundle, UploadedFile } from './deep-evaluation.types';

export async function fetchDeepEvaluationBundle(requestId: string): Promise<DeepEvaluationBundle> {
  const { data } = await api.get(`/deep-evaluation/by-request/${requestId}`);
  return data;
}

export async function startDeepEvaluation(requestId: string): Promise<void> {
  await api.post(`/deep-evaluation/requests/${requestId}/start-deep-evaluation`);
}

export async function uploadInvoice(
  phaseId: number,
  fileUrl: string,
  mimeType: string,
  uploadAssetId?: number
): Promise<void> {
  await api.post(`/deep-evaluation/phases/${phaseId}/invoice`, {
    fileUrl,
    mimeType,
    uploadAssetId,
  });
}

export async function uploadPaymentProof(
  phaseId: number,
  requestId: string,
  fileUrl: string,
  mimeType: string,
  uploadAssetId?: number
): Promise<void> {
  await api.post(`/deep-evaluation/phases/${phaseId}/requests/${requestId}/proof`, {
    fileUrl,
    mimeType,
    uploadAssetId,
  });
}

export async function validatePayment(phaseId: number): Promise<void> {
  await api.post(`/deep-evaluation/phases/${phaseId}/payment/validate`);
}

export async function rejectPayment(
  phaseId: number,
  rejectionAction: 'request_new_proof' | 'reject_dossier',
  rejectionReason: string
): Promise<void> {
  await api.post(`/deep-evaluation/phases/${phaseId}/payment/reject`, {
    rejectionAction,
    rejectionReason,
  });
}

export async function setVerdict(
  evaluationId: number,
  verdict: 'validated' | 'rejected' | 'needs_correction',
  correctionDays?: number
): Promise<void> {
  await api.patch(`/deep-evaluation/evaluations/${evaluationId}/verdict`, {
    verdict,
    correctionDays,
  });
}

export async function resubmitDocument(
  evaluationId: number,
  fileUrl: string,
  mimeType: string,
  uploadAssetId?: number
): Promise<void> {
  await api.post(`/deep-evaluation/evaluations/${evaluationId}/resubmit`, {
    fileUrl,
    mimeType,
    uploadAssetId,
  });
}

export async function closeDeepEvaluationPhase(params: {
  phaseId: number;
  closureNote?: string;
  closureDocumentUrl?: string;
  closureDocumentMimeType?: string;
  closureDocumentUploadAssetId?: number;
}): Promise<void> {
  await api.post(`/deep-evaluation/phases/${params.phaseId}/close`, {
    closureDocumentUrl: params.closureDocumentUrl,
    closureDocumentMimeType: params.closureDocumentMimeType,
    closureDocumentUploadAssetId: params.closureDocumentUploadAssetId,
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
