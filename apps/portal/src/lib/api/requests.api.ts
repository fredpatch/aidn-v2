import { api } from '../axios';
import type {
  FormalBundle,
  PreliminaryBundle,
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
