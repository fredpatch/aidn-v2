/** STORAGE-0B - receiving a browser upload without leaving stray files.
 *  A refused type never reaches disk (Multer fileFilter); anything that
 *  fails after Multer wrote the file and before the asset row commits
 *  deletes the file. A registered asset that is never attached is left to
 *  orphan cleanup (retention), so the user can retry. */
import fs from 'node:fs/promises';
import multer from 'multer';
import { ACCEPTED_DOCUMENT_MIME_TYPES } from '@aidn/shared';

export type UploadRejectionCode = 'UPLOAD_TYPE_NOT_ACCEPTED' | 'UPLOAD_EMPTY';

export class UploadRejectedError extends Error {
  constructor(readonly code: UploadRejectionCode) {
    super(code);
    this.name = 'UploadRejectedError';
  }
}

export function acceptsUploadMime(mimeType: string): boolean {
  return (ACCEPTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType);
}

const REJECTIONS: Record<UploadRejectionCode, string> = {
  UPLOAD_TYPE_NOT_ACCEPTED: 'Type de fichier non accepte. Formats acceptes : PDF, Word, PNG, JPG.',
  UPLOAD_EMPTY: 'Le fichier est vide.',
};

/** Response for an upload refused before registration; null = not ours. */
export function uploadRejection(error: unknown): { status: number; message: string; code: string } | null {
  if (error instanceof UploadRejectedError) {
    return { status: 400, message: REJECTIONS[error.code], code: error.code };
  }
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return { status: 413, message: 'Fichier trop volumineux (20 Mo maximum).', code: 'UPLOAD_TOO_LARGE' };
    }
    return { status: 400, message: 'Envoi du fichier invalide.', code: 'UPLOAD_INVALID' };
  }
  return null;
}

export async function discardUploadedFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[uploads] Could not delete a refused upload:', (error as Error).message);
    }
  }
}

/** Runs the asset registration for a file Multer has written; any refusal or
 *  failure before it commits deletes the file. */
export async function registerReceivedFile<T>(
  file: { path: string; size: number },
  register: () => Promise<T>
): Promise<T> {
  try {
    if (file.size === 0) throw new UploadRejectedError('UPLOAD_EMPTY');
    return await register();
  } catch (error) {
    await discardUploadedFile(file.path);
    throw error;
  }
}
