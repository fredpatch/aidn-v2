/** STORAGE-0A - pure helpers for opening stored files. A stored file has a
 *  stable address (/api/files/<id>); it is never opened directly but through
 *  a short-lived signed grant (see file-access.ts). */
import { parseFileAddress } from '@aidn/shared';

export type FileDisposition = 'inline' | 'attachment';
export type PreviewKind = 'pdf' | 'image' | 'unsupported';

export interface FileGrant {
  url: string;
  expiresAt: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  disposition: FileDisposition;
}

/** From the server-side MIME type of the grant - never the URL. SVG is
 *  deliberately not previewed (it can carry script). */
export function previewKindForMime(mimeType: string): PreviewKind {
  if (mimeType === 'application/pdf') return 'pdf';
  if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) return 'image';
  return 'unsupported';
}

export function isOpenableAddress(address: string | null | undefined): boolean {
  return parseFileAddress(address) !== null;
}

/** Path for POST /api/files/:id/access, relative to the API client base. */
export function accessPathFor(address: string | null | undefined): string | null {
  const id = parseFileAddress(address);
  return id === null ? null : `/files/${id}/access`;
}

interface ErrorLike {
  isAxiosError?: boolean;
  response?: { status?: number; data?: { code?: string; message?: string } };
}

export function fileAccessErrorMessage(error: unknown): string {
  const response = (error as ErrorLike)?.response;
  if (response?.data?.code === 'AMBIGUOUS_SESSION' && response.data.message) return response.data.message;
  if (response?.status === 404 || response?.status === 403) return 'Fichier introuvable ou accès refusé.';
  return 'Impossible d’ouvrir le fichier.';
}
