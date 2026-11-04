import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import { applicants, organisations } from "../../shared/db/schema.js";
import {
  signApplicantAccessToken,
  signApplicantRefreshToken,
  verifyApplicantRefreshToken,
  tokenAuthVersion,
  ApplicantTokenPayload,
} from "../../shared/utils/jwt.js";
import { logAudit } from "../auth/auth.service.js";
import { normalizeEmail } from "../../shared/utils/email-address.js";
import { assertApplicantPasswordPolicy, hashApplicantPassword } from "./applicant-password.js";

export interface ApplicantPublic {
  id: number;
  organisationId: number;
  /** Display name of the applicant's organisation (portal "Mon compte"). */
  organisationName: string;
  fullName: string;
  email: string;
  contactOrder: string;
  /** ACCOUNT-V2 - temporary password: the portal opens only the change screen. */
  mustChangePassword: boolean;
}

async function toApplicantPublic(applicant: typeof applicants.$inferSelect): Promise<ApplicantPublic> {
  const [organisation] = await db
    .select({ name: organisations.name })
    .from(organisations)
    .where(eq(organisations.id, applicant.organisationId));
  return {
    id: applicant.id,
    organisationId: applicant.organisationId,
    organisationName: organisation?.name ?? '',
    fullName: applicant.fullName,
    email: applicant.email,
    contactOrder: applicant.contactOrder,
    mustChangePassword: applicant.mustChangePassword,
  };
}

function buildPayload(applicant: typeof applicants.$inferSelect): ApplicantTokenPayload {
  return {
    kind: "applicant",
    applicantId: applicant.id,
    organisationId: applicant.organisationId,
    email: applicant.email,
    authVersion: applicant.authVersion,
  };
}

type ApplicantTokens = { accessToken: string; refreshToken: string };

function issueTokens(applicant: typeof applicants.$inferSelect): ApplicantTokens {
  const payload = buildPayload(applicant);
  return { accessToken: signApplicantAccessToken(payload), refreshToken: signApplicantRefreshToken(payload) };
}

/** Login only - real applicant *account creation* is M13 (account-request
 *  approval, with anti-bot + organisation dedup). This assumes the
 *  applicant row already exists. */
export async function login(params: {
  email: string;
  password: string;
}): Promise<{ tokens: { accessToken: string; refreshToken: string }; applicant: ApplicantPublic }> {
  // Stored emails are normalised (trim + lowercase); the typed identifier is
  // matched the same way. The password is compared exactly as typed.
  const [applicant] = await db.select().from(applicants).where(eq(applicants.email, normalizeEmail(String(params.email))));

  if (!applicant || !applicant.active) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }

  const passwordValid = await bcrypt.compare(params.password, applicant.passwordHash);
  if (!passwordValid) {
    throw new Error("PASSWORD_INVALID");
  }

  await logAudit({ action: "APPLICANT_LOGIN", module: "M13", entityId: applicant.id });

  return { tokens: issueTokens(applicant), applicant: await toApplicantPublic(applicant) };
}

export async function refreshToken(token: string): Promise<{ accessToken: string }> {
  const payload = verifyApplicantRefreshToken(token);

  const [applicant] = await db.select().from(applicants).where(eq(applicants.id, payload.applicantId));
  if (!applicant || !applicant.active) throw new Error("ACCOUNT_INACTIVE");
  // ACCOUNT-V2 - a refresh token issued before a reset or change is dead.
  if (tokenAuthVersion(payload) !== applicant.authVersion) throw new Error("SESSION_REVOKED");

  return { accessToken: signApplicantAccessToken(buildPayload(applicant)) };
}

export async function me(applicantId: number): Promise<ApplicantPublic> {
  const [applicant] = await db.select().from(applicants).where(eq(applicants.id, applicantId));
  if (!applicant) throw new Error("ACCOUNT_NOT_FOUND");
  return await toApplicantPublic(applicant);
}

/** ACCOUNT-V2 - the applicant replaces their password (always after an admin
 *  reset, the temporary one). The current password is required even though
 *  the session proves the login: a borrowed open session cannot take the
 *  account. The version moves on, so every other session ends; the caller
 *  gets a fresh pair at the new version. Never logs a password. */
export async function changePassword(params: {
  session: ApplicantTokenPayload;
  currentPassword: unknown;
  newPassword: unknown;
}): Promise<{ tokens: ApplicantTokens; applicant: ApplicantPublic }> {
  if (typeof params.currentPassword !== "string" || !params.currentPassword) throw new Error("INVALID_CURRENT_PASSWORD");
  assertApplicantPasswordPolicy(params.newPassword);
  const currentPassword = params.currentPassword;
  const newPassword = params.newPassword;

  const updated = await db.transaction(async (tx) => {
    const [applicant] = await tx.select().from(applicants).where(eq(applicants.id, params.session.applicantId)).for("update");
    // Reset or suspended between the guard and this lock: same as a dead session.
    if (!applicant || !applicant.active || applicant.authVersion !== tokenAuthVersion(params.session)) {
      throw new Error("SESSION_REVOKED");
    }
    if (!(await bcrypt.compare(currentPassword, applicant.passwordHash))) throw new Error("INVALID_CURRENT_PASSWORD");
    if (await bcrypt.compare(newPassword, applicant.passwordHash)) throw new Error("PASSWORD_UNCHANGED");

    const [row] = await tx
      .update(applicants)
      .set({
        passwordHash: await hashApplicantPassword(newPassword),
        authVersion: sql`${applicants.authVersion} + 1`,
        mustChangePassword: false,
      })
      .where(eq(applicants.id, applicant.id))
      .returning();
    await logAudit(
      {
        applicantId: applicant.id,
        action: "APPLICANT_PASSWORD_CHANGED",
        module: "M13",
        entityId: applicant.id,
        details: { forced: applicant.mustChangePassword, sessions_invalidated: true },
      },
      tx
    );
    return row;
  });

  return { tokens: issueTokens(updated), applicant: await toApplicantPublic(updated) };
}
