import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { applicants } from '../db/schema.js';
import { tokenAuthVersion, type ApplicantTokenPayload } from '../utils/jwt.js';

/** ACCOUNT-V2 - an applicant JWT proves who signed in, not that the session
 *  still stands: every consumer of an applicant access token (the guards,
 *  file delivery) checks the account here, one indexed read per request.
 *  A token is revoked when the account is gone or suspended, or when its
 *  credential version is older than the account's (password reset or
 *  change). */

export interface ApplicantSessionState {
  active: boolean;
  authVersion: number;
  mustChangePassword: boolean;
}

type SessionLookup = (applicantId: number) => Promise<ApplicantSessionState | null>;

const databaseLookup: SessionLookup = async (applicantId) => {
  const [row] = await db
    .select({
      active: applicants.active,
      authVersion: applicants.authVersion,
      mustChangePassword: applicants.mustChangePassword,
    })
    .from(applicants)
    .where(eq(applicants.id, applicantId));
  return row ?? null;
};

let lookup: SessionLookup = databaseLookup;

/** HTTP tests without a database only (identity resolution); null restores
 *  the database read. */
export function setApplicantSessionLookup(next: SessionLookup | null): void {
  lookup = next ?? databaseLookup;
}

export interface ApplicantSession {
  payload: ApplicantTokenPayload;
  /** Temporary password: only the password change is open. */
  mustChangePassword: boolean;
}

/** The live session behind a verified token, or null when it was revoked. */
export async function currentApplicantSession(payload: ApplicantTokenPayload): Promise<ApplicantSession | null> {
  if (!Number.isSafeInteger(payload.applicantId)) return null;
  const state = await lookup(payload.applicantId);
  if (!state || !state.active || state.authVersion !== tokenAuthVersion(payload)) return null;
  return { payload, mustChangePassword: state.mustChangePassword };
}

export const PASSWORD_CHANGE_REQUIRED_BODY = {
  message: 'Votre mot de passe doit être modifié avant de continuer.',
  code: 'PASSWORD_CHANGE_REQUIRED',
} as const;
