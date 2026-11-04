import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

/** ACCOUNT-V2 - one password policy and one hash for applicant accounts:
 *  account request, temporary password and password change. The policy is
 *  the existing one (8 characters minimum), unchanged. */

export const APPLICANT_PASSWORD_MIN_LENGTH = 8;
const BCRYPT_COST = 10;

export function assertApplicantPasswordPolicy(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length < APPLICANT_PASSWORD_MIN_LENGTH) throw new Error('PASSWORD_TOO_SHORT');
}

export function hashApplicantPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** No look-alike characters (0/O, 1/l/I): the password is read out or typed
 *  by hand. 55 symbols, 16 characters: about 92 bits of entropy. */
const TEMPORARY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const TEMPORARY_LENGTH = 16;

/** A temporary password from the CSPRNG (crypto.randomInt, unbiased). */
export function generateTemporaryPassword(): string {
  let password = '';
  for (let i = 0; i < TEMPORARY_LENGTH; i += 1) password += TEMPORARY_ALPHABET[randomInt(TEMPORARY_ALPHABET.length)];
  return password;
}
