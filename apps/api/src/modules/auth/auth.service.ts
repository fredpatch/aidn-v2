import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import { users, auditLogs } from "../../shared/db/schema.js";
import { verifyRefreshToken, signAccessToken } from "../../shared/utils/jwt.js";
import { verifyOTP, isOTPExpired, generateOTP, hashOTP, otpExpiresAt } from "../../shared/utils/otp.js";
import { sendAccountActivatedEmail, sendOTPEmail } from "../../shared/utils/email.js";
import { SALT_ROUNDS } from "./auth.constants.js";
import { handleFailedLogin, resetFailedAttempts, buildTokens, buildUserPublic } from "./auth.helpers.js";
import type { AuthTokens, UserPublic, LoginResult } from "./auth.types.js";
import { getIntegerValue } from "../system-parameters/system-parameters.service.js";

export type { AuthTokens, UserPublic, LoginResult } from "./auth.types.js";

/** Audit utility - imported across many modules (requests, users,
 *  system-parameters, etc.). Do not relocate without a full import sweep. */
export async function logAudit(params: {
  userId?: number;
  action: string;
  module: string;
  entityId?: number;
  details?: Record<string, unknown>;
  ip?: string;
}): Promise<void> {
  await db.insert(auditLogs).values({
    userId: params.userId,
    action: params.action,
    module: params.module,
    entityId: params.entityId,
    details: params.details,
    ip: params.ip,
  });
}

export async function login(params: {
  employeeCode: string;
  otp?: string;
  password?: string;
  ip?: string;
}): Promise<LoginResult> {
  const { employeeCode, otp, password, ip } = params;

  const [user] = await db.select().from(users).where(eq(users.employeeCode, employeeCode));

  if (!user || !user.active) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }

  if (user.lockedUntil && new Date() < user.lockedUntil) {
    throw new Error("ACCOUNT_LOCKED");
  }

  // ── Case 1: first login, via OTP ──────────────────────────────────────
  if (user.firstLogin) {
    if (!otp) throw new Error("OTP_REQUIRED");
    if (!user.otpHash || !user.otpExpiresAt) throw new Error("OTP_NOT_GENERATED");
    if (isOTPExpired(user.otpExpiresAt)) throw new Error("OTP_EXPIRED");

    const otpValid = await verifyOTP(otp, user.otpHash);
    if (!otpValid) {
      await handleFailedLogin(user.id, user.failedAttempts ?? 0);
      throw new Error("OTP_INVALID");
    }

    await resetFailedAttempts(user.id);
    await logAudit({ userId: user.id, action: "OTP_VALIDATED", module: "M13", ip });

    // Temporary token, 5 minutes, to secure the /set-password call only.
    const tempAccessToken = signAccessToken({
      userId: user.id,
      employeeCode: user.employeeCode,
      roles: ["first_login"],
    });

    return {
      firstLogin: true,
      tokens: { accessToken: tempAccessToken, refreshToken: "" },
      message: "OTP valide. Veuillez definir votre mot de passe.",
    };
  }

  // ── Case 2: normal login, via password ────────────────────────────────
  if (!password) throw new Error("PASSWORD_REQUIRED");
  if (!user.passwordHash) throw new Error("PASSWORD_NOT_SET");

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    await handleFailedLogin(user.id, user.failedAttempts ?? 0);
    throw new Error("PASSWORD_INVALID");
  }

  await resetFailedAttempts(user.id);
  await logAudit({ userId: user.id, action: "LOGIN", module: "M13", ip });

  return {
    firstLogin: false,
    tokens: await buildTokens(user),
    user: await buildUserPublic(user),
    message: "Connexion reussie.",
  };
}

export async function setPassword(params: {
  userId: number;
  password: string;
  confirmation: string;
  ip?: string;
}): Promise<{ tokens: AuthTokens; user: UserPublic }> {
  const { userId, password, confirmation, ip } = params;

  if (password !== confirmation) throw new Error("PASSWORDS_DO_NOT_MATCH");
  if (password.length < 8) throw new Error("PASSWORD_TOO_SHORT");

  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  const [user] = await db
    .update(users)
    .set({ passwordHash: hash, firstLogin: false, otpHash: null, otpExpiresAt: null })
    .where(eq(users.id, userId))
    .returning();

  await logAudit({ userId: user.id, action: "PASSWORD_SET", module: "M13", ip });

  try {
    await sendAccountActivatedEmail({
      to: user.email,
      fullName: user.fullName,
      employeeCode: user.employeeCode,
      dateTime: new Date().toLocaleString("fr-FR"),
      ip,
    });
  } catch (error) {
    console.error("[email] Failed to send activation confirmation:", error);
  }

  return { tokens: await buildTokens(user), user: await buildUserPublic(user) };
}

export async function refreshToken(token: string): Promise<{ accessToken: string }> {
  const payload = verifyRefreshToken(token);

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId));
  if (!user || !user.active) throw new Error("ACCOUNT_INACTIVE");

  const roles = payload.roles;
  const accessToken = signAccessToken({ userId: user.id, employeeCode: user.employeeCode, roles });

  return { accessToken };
}

export async function generateAndSendOTP(userId: number): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("USER_NOT_FOUND");
  if (!user.email) throw new Error("EMAIL_MISSING");

  const otp = generateOTP();
  const otpHash = await hashOTP(otp);
  const expirationMinutes = await getIntegerValue("otp_expiration_minutes", 15);
  const expiresAt = otpExpiresAt(expirationMinutes);

  await db.update(users).set({ otpHash, otpExpiresAt: expiresAt }).where(eq(users.id, userId));

  await sendOTPEmail({
    to: user.email,
    fullName: user.fullName,
    employeeCode: user.employeeCode,
    otp,
  });

  await logAudit({ userId: user.id, action: "OTP_GENERATED", module: "M13" });
}
