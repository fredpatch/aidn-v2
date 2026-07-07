import crypto from "crypto";
import bcrypt from "bcryptjs";

const OTP_LENGTH = 6;
const SALT_ROUNDS = 10;

/** crypto.randomInt is cryptographically secure - never Math.random() for this. */
export function generateOTP(): string {
  const otp = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return otp.toString().padStart(OTP_LENGTH, "0");
}

/** The OTP is never stored in clear text, same as a password. */
export async function hashOTP(otp: string): Promise<string> {
  return bcrypt.hash(otp, SALT_ROUNDS);
}

export async function verifyOTP(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

export function otpExpiresAt(minutes: number): Date {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + minutes);
  return expiresAt;
}

export function isOTPExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}
