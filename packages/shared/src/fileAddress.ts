/** M8 - stable application address of a stored file: /api/files/<uploadAssetId>.
 *  The upload asset id is the file's identity; its physical location
 *  (upload_assets.storage_key) is never part of the address, so files can be
 *  moved without rewriting any stored address. */
const FILE_ADDRESS = /^\/api\/files\/([1-9]\d*)$/;

export function fileAddress(uploadAssetId: number): string {
  return `/api/files/${uploadAssetId}`;
}

/** The asset id of a stable address, or null for any other value
 *  (legacy /uploads/... paths, external URLs, garbage). */
export function parseFileAddress(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const match = FILE_ADDRESS.exec(value);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}

/** STORAGE-0B - POST /api/uploads response. Business endpoints take only
 *  uploadAssetId; name, type and size are for display, never sent back. */
export interface UploadedAsset {
  uploadAssetId: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}
