import type { UploadedAsset } from '@aidn/shared';
import { api } from './axios';

/** STORAGE-0B - the one upload helper. Send only `uploadAssetId` to the
 *  business endpoint; the server derives the file address and type. */
export async function uploadFile(file: File, moduleHint?: string): Promise<UploadedAsset> {
  const formData = new FormData();
  // Text fields before the file, so Multer sees them when storing it.
  if (moduleHint) formData.append('moduleHint', moduleHint);
  formData.append('file', file);
  const { data } = await api.post<UploadedAsset>('/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
