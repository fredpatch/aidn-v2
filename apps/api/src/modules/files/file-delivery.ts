/** STORAGE-0A - pure helpers for delivering a stored file: who is asking
 *  (never guessed between two valid sessions), where the file is, and the
 *  response headers (from server-side metadata and the signed mode only). */
import path from 'node:path';
import type { ApplicantTokenPayload, TokenPayload } from '../../shared/utils/jwt.js';
import type { FileActor } from './file-access.policy.js';
import type { FileDisposition } from './file-grant.js';

export type ActorResolution = { actor: FileActor; error?: undefined } | { actor?: undefined; error: 'unauthenticated' | 'ambiguous' };

/** Amendment A1. Two valid sessions are resolved only by a trusted Origin
 *  (ADMIN_ORIGIN -> staff, PORTAL_ORIGIN -> applicant); anything else is
 *  rejected rather than guessed. */
export function resolveFileActor(input: {
  staff: TokenPayload | null;
  applicant: ApplicantTokenPayload | null;
  origin: string | undefined;
  adminOrigin: string | undefined;
  portalOrigin: string | undefined;
}): ActorResolution {
  const staffActor: FileActor | null = input.staff
    ? { kind: 'staff', userId: input.staff.userId, roles: input.staff.roles }
    : null;
  const applicantActor: FileActor | null = input.applicant
    ? { kind: 'applicant', applicantId: input.applicant.applicantId }
    : null;

  if (staffActor && !applicantActor) return { actor: staffActor };
  if (applicantActor && !staffActor) return { actor: applicantActor };
  if (!staffActor || !applicantActor) return { error: 'unauthenticated' };

  if (input.origin && input.adminOrigin && input.origin === input.adminOrigin) return { actor: staffActor };
  if (input.origin && input.portalOrigin && input.origin === input.portalOrigin) return { actor: applicantActor };
  return { error: 'ambiguous' };
}

/** Absolute path of a storage key inside the uploads root, or null if the
 *  key is empty or would escape the root. */
export function resolveStoragePath(root: string, storageKey: string): string | null {
  const key = storageKey.replace(/^[\\/]+/, '');
  if (!key) return null;
  const fullPath = path.resolve(root, key);
  const relative = path.relative(root, fullPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return fullPath;
}

function safeName(name: string): string {
  // No path separators or control characters; keep the extension readable.
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/\u0000-\u001f\u007f]+/g, '_').trim();
  return cleaned || 'document';
}

function asciiFallback(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
}

function rfc5987(name: string): string {
  return encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function buildFileHeaders(
  asset: { mimeType: string; originalName: string; sizeBytes: number },
  disposition: FileDisposition
): Record<string, string> {
  const name = safeName(asset.originalName);
  return {
    'Content-Type': asset.mimeType,
    'Content-Length': String(asset.sizeBytes),
    'Content-Disposition': `${disposition}; filename="${asciiFallback(name)}"; filename*=UTF-8''${rfc5987(name)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}

/** Request URLs are logged (morgan); a signed grant must never be. */
export function redactFileGrant(url: string): string {
  return url.replace(/([?&]grant=)[^&#]*/g, '$1[redacted]');
}
