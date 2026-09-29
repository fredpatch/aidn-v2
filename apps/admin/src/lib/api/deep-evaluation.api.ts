import { api } from '../axios';
import type {
  DeepEvaluationBundle,
  PaymentQueueItem,
} from './deep-evaluation.types';

export async function fetchDeepEvaluationBundle(requestId: string): Promise<DeepEvaluationBundle> {
  const { data } = await api.get(`/deep-evaluation/by-request/${requestId}`);
  return data;
}

export async function fetchDeepEvaluationPaymentQueue(): Promise<PaymentQueueItem[]> {
  const { data } = await api.get('/deep-evaluation/payment-queue');
  return data;
}

export async function startDeepEvaluation(requestId: string): Promise<void> {
  await api.post(`/deep-evaluation/requests/${requestId}/start-deep-evaluation`);
}

export async function uploadInvoice(phaseId: number, uploadAssetId: number): Promise<void> {
  await api.post(`/deep-evaluation/phases/${phaseId}/invoice`, { uploadAssetId });
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

export async function closeDeepEvaluationPhase(params: {
  phaseId: number;
  closureNote?: string;
  closureDocumentUploadAssetId?: number;
}): Promise<void> {
  await api.post(`/deep-evaluation/phases/${params.phaseId}/close`, {
    closureDocumentUploadAssetId: params.closureDocumentUploadAssetId,
    closureNote: params.closureNote || undefined,
  });
}

// STORAGE-0B - one shared upload helper (returns uploadAssetId).
export { uploadFile } from '../uploads';
