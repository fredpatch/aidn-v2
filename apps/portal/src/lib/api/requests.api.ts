import { api } from '../axios';
import type {
  CertificatesBundle,
  DeepEvaluationBundle,
  FormalBundle,
  PreliminaryBundle,
  SiteInspectionBundle,
  RequestView,
  SubmitMyRequestInput,
} from './requests.types';

export async function fetchMyRequests(): Promise<RequestView[]> {
  const { data } = await api.get('/requests/mine');
  return data;
}

export async function cancelMyRequest(requestId: number): Promise<void> {
  await api.post(`/requests/${requestId}/cancel`);
}

export async function submitMyRequest(input: SubmitMyRequestInput): Promise<void> {
  await api.post('/requests', input);
}

// STORAGE-0B - one shared upload helper (returns uploadAssetId).
export { uploadFile } from '../uploads';

export async function fetchPreliminaryBundle(requestId: number): Promise<PreliminaryBundle> {
  const { data } = await api.get(`/preliminary-evaluation/by-request/${requestId}`);
  return data;
}

export async function submitPreliminaryDeclaration(phaseId: number, uploadAssetId: number): Promise<void> {
  await api.post(`/preliminary-evaluation/${phaseId}/submit`, { uploadAssetId });
}

export async function fetchFormalBundle(requestId: number): Promise<FormalBundle> {
  const { data } = await api.get(`/formal-request/by-request/${requestId}`);
  return data;
}

export async function submitFormalLetter(requestId: number, uploadAssetId: number): Promise<void> {
  await api.post(`/formal-request/requests/${requestId}/letter`, { uploadAssetId });
}

export async function submitFormalDocument(requestId: number, slot: string, uploadAssetId: number): Promise<void> {
  await api.post(`/formal-request/requests/${requestId}/documents`, { slot, uploadAssetId });
}

export async function fetchDeepEvaluationBundle(requestId: number): Promise<DeepEvaluationBundle> {
  const { data } = await api.get(`/deep-evaluation/by-request/${requestId}`);
  return data;
}

export async function submitDeepEvaluationProof(phaseId: number, requestId: number, uploadAssetId: number): Promise<void> {
  await api.post(`/deep-evaluation/phases/${phaseId}/requests/${requestId}/proof`, { uploadAssetId });
}

export async function resubmitDeepEvaluationDocument(evaluationId: number, uploadAssetId: number): Promise<void> {
  await api.post(`/deep-evaluation/evaluations/${evaluationId}/resubmit`, { uploadAssetId });
}

export async function fetchSiteInspectionBundle(requestId: number): Promise<SiteInspectionBundle> {
  const { data } = await api.get(`/site-inspection/by-request/${requestId}`);
  return data;
}

export async function submitSiteInspectionProof(phaseId: number, requestId: number, uploadAssetId: number): Promise<void> {
  await api.post(`/site-inspection/phases/${phaseId}/requests/${requestId}/proof`, { uploadAssetId });
}

export async function fetchCertificatesBundle(requestId: number): Promise<CertificatesBundle> {
  const { data } = await api.get(`/certificates/by-request/${requestId}`);
  return data;
}

export async function submitCertificatesProof(phaseId: number, requestId: number, uploadAssetId: number): Promise<void> {
  await api.post(`/certificates/phases/${phaseId}/requests/${requestId}/proof`, { uploadAssetId });
}
