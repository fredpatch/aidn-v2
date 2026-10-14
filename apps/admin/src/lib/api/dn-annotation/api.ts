import { api } from '../../axios';
import type { DnAnnotationListResponse } from './types';

export async function fetchDnAnnotationTasks(): Promise<DnAnnotationListResponse> {
  const { data } = await api.get('/dn-annotation-tasks');
  return data;
}

export async function sendToDirectorDn(taskId: string): Promise<void> {
  await api.post(`/dn-annotation-tasks/${encodeURIComponent(taskId)}/send-to-director`);
}

export async function returnDirectorAnnotation(taskId: string, uploadAssetId: number): Promise<void> {
  await api.post(`/dn-annotation-tasks/${encodeURIComponent(taskId)}/return-annotated`, { uploadAssetId });
}
