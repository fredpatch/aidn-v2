import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import { applicants } from "../../shared/db/schema.js";
import {
  signApplicantAccessToken,
  signApplicantRefreshToken,
  verifyApplicantRefreshToken,
  ApplicantTokenPayload,
} from "../../shared/utils/jwt.js";
import { logAudit } from "../auth/auth.service.js";

export interface ApplicantPublic {
  id: number;
  organisationId: number;
  fullName: string;
  email: string;
  contactOrder: string;
}

function toApplicantPublic(applicant: typeof applicants.$inferSelect): ApplicantPublic {
  return {
    id: applicant.id,
    organisationId: applicant.organisationId,
    fullName: applicant.fullName,
    email: applicant.email,
    contactOrder: applicant.contactOrder,
  };
}

function buildPayload(applicant: typeof applicants.$inferSelect): ApplicantTokenPayload {
  return {
    kind: "applicant",
    applicantId: applicant.id,
    organisationId: applicant.organisationId,
    email: applicant.email,
  };
}

/** Login only - real applicant *account creation* is M13 (account-request
 *  approval, with anti-bot + organisation dedup). This assumes the
 *  applicant row already exists. */
export async function login(params: {
  email: string;
  password: string;
}): Promise<{ tokens: { accessToken: string; refreshToken: string }; applicant: ApplicantPublic }> {
  const [applicant] = await db.select().from(applicants).where(eq(applicants.email, params.email));

  if (!applicant || !applicant.active) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }

  const passwordValid = await bcrypt.compare(params.password, applicant.passwordHash);
  if (!passwordValid) {
    throw new Error("PASSWORD_INVALID");
  }

  const payload = buildPayload(applicant);

  await logAudit({ action: "APPLICANT_LOGIN", module: "M13", entityId: applicant.id });

  return {
    tokens: {
      accessToken: signApplicantAccessToken(payload),
      refreshToken: signApplicantRefreshToken(payload),
    },
    applicant: toApplicantPublic(applicant),
  };
}

export async function refreshToken(token: string): Promise<{ accessToken: string }> {
  const payload = verifyApplicantRefreshToken(token);

  const [applicant] = await db.select().from(applicants).where(eq(applicants.id, payload.applicantId));
  if (!applicant || !applicant.active) throw new Error("ACCOUNT_INACTIVE");

  return { accessToken: signApplicantAccessToken(buildPayload(applicant)) };
}

export async function me(applicantId: number): Promise<ApplicantPublic> {
  const [applicant] = await db.select().from(applicants).where(eq(applicants.id, applicantId));
  if (!applicant) throw new Error("ACCOUNT_NOT_FOUND");
  return toApplicantPublic(applicant);
}
