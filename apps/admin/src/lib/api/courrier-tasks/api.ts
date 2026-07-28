import { api } from '../../axios';
import type { CourrierTaskListResponse } from './types';

export async function fetchCourrierTasks(params?: {
  bucket?: string;
  source?: string;
}): Promise<CourrierTaskListResponse> {
  const { data } = await api.get('/courrier-tasks', { params });
  return data;
}

export async function confirmCourrierPrinted(taskId: string): Promise<void> {
  await api.post(`/courrier-tasks/${encodeURIComponent(taskId)}/confirm-printed-for-signature`);
}

export async function returnSignedCourrier(
  taskId: string,
  fileUrl: string,
  mimeType: string,
  uploadAssetId?: number
): Promise<void> {
  await api.post(`/courrier-tasks/${encodeURIComponent(taskId)}/return-signed`, {
    fileUrl,
    mimeType,
    uploadAssetId,
  });
}
