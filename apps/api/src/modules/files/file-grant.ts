/** STORAGE-0A - short-lived signed grants for native browser/iframe file
 *  delivery. Issued only after the access check passed; the grant alone
 *  authorizes GET /api/files/:id/content for five minutes.
 *
 *  Token: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload part)).
 *  Signed with FILE_GRANT_SECRET, never the session JWT secrets. The payload
 *  never contains a storage path. */
import crypto from 'node:crypto';
import type { FileActor } from './file-access.policy.js';

export const FILE_GRANT_TTL_SECONDS = 300;
export type FileDisposition = 'inline' | 'attachment';

interface GrantPayload {
  v: 1;
  /** upload asset id */
  a: number;
  /** expiry, epoch seconds */
  e: number;
  /** who the grant was issued to (traceability, not authorization) */
  s: string;
  /** delivery mode, bound by the signature */
  d: FileDisposition;
}

function sign(payloadPart: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadPart).digest('base64url');
}

function encode(payload: object, secret: string): string {
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadPart}.${sign(payloadPart, secret)}`;
}

/** Test helper: signs an arbitrary payload (to prove verification rejects
 *  well-signed but invalid content). */
export function signPayloadForTest(payload: object, secret: string): string {
  return encode(payload, secret);
}

function actorMarker(actor: FileActor): string {
  return actor.kind === 'staff' ? `staff:${actor.userId}` : `applicant:${actor.applicantId}`;
}

export function createFileGrant(params: {
  assetId: number;
  actor: FileActor;
  disposition: FileDisposition;
  secret: string;
  now?: Date;
}): { token: string; expiresAt: Date } {
  const nowSeconds = Math.floor((params.now ?? new Date()).getTime() / 1000);
  const payload: GrantPayload = {
    v: 1,
    a: params.assetId,
    e: nowSeconds + FILE_GRANT_TTL_SECONDS,
    s: actorMarker(params.actor),
    d: params.disposition,
  };
  return { token: encode(payload, params.secret), expiresAt: new Date(payload.e * 1000) };
}

/** The signed delivery mode, or null for any invalid grant (malformed,
 *  tampered, wrong secret, other asset, expired, unknown version/mode).
 *  Never throws and never says why - callers answer generically. */
export function verifyFileGrant(
  token: string,
  assetId: number,
  options: { secret: string; now?: Date }
): { disposition: FileDisposition } | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const expected = Buffer.from(sign(parts[0], options.secret));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  let payload: Partial<GrantPayload>;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (payload?.v !== 1) return null;
  if (payload.a !== assetId) return null;
  if (typeof payload.e !== 'number' || payload.e <= nowSeconds) return null;
  if (payload.d !== 'inline' && payload.d !== 'attachment') return null;
  return { disposition: payload.d };
}

let generatedDevSecret: string | undefined;

/** Local development and tests only - staging runs with NODE_ENV=staging
 *  and must be configured like production. */
export function isLocalEnvironment(): boolean {
  const env = process.env.NODE_ENV;
  return !env || env === 'development' || env === 'test';
}

/** FILE_GRANT_SECRET, required outside local development (staging and
 *  production). Locally a random per-process secret is used (grants stop
 *  working after a restart). */
export function fileGrantSecret(): string {
  const configured = process.env.FILE_GRANT_SECRET;
  if (configured) return configured;
  if (!isLocalEnvironment()) {
    throw new Error('FILE_GRANT_SECRET is required outside local development.');
  }
  if (!generatedDevSecret) {
    generatedDevSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[files] FILE_GRANT_SECRET is not set - using a temporary development secret.');
  }
  return generatedDevSecret;
}
