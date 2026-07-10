import { api } from '../axios';
import type {
  FormalBundle,
  PreliminaryBundle,
  RequestView,
  SubmitMyRequestInput,
  UploadedFile,
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

export async function uploadFile(file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function fetchPreliminaryBundle(requestId: number): Promise<PreliminaryBundle> {
  const { data } = await api.get(`/preliminary-evaluation/by-request/${requestId}`);
  return data;
}

export async function submitPreliminaryDeclaration(
  phaseId: number,
  fileUrl: string,
  mimeType: string
): Promise<void> {
  await api.post(`/preliminary-evaluation/${phaseId}/submit`, {
    fileUrl,
    mimeType,
  });
}

export async function fetchFormalBundle(requestId: number): Promise<FormalBundle> {
  const { data } = await api.get(`/formal-request/by-request/${requestId}`);
  return data;
}

export async function submitFormalLetter(
  requestId: number,
  fileUrl: string,
  mimeType: string
): Promise<void> {
  await api.post(`/formal-request/requests/${requestId}/letter`, {
    fileUrl,
    mimeType,
  });
}

export async function submitFormalDocument(
  requestId: number,
  slot: string,
  fileUrl: string,
  mimeType: string
): Promise<void> {
  await api.post(`/formal-request/requests/${requestId}/documents`, {
    slot,
    fileUrl,
    mimeType,
  });
}
