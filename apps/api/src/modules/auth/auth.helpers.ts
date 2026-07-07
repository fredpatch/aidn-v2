import { eq } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import { users, userRoles } from "../../shared/db/schema.js";
import { signAccessToken, signRefreshToken, TokenPayload } from "../../shared/utils/jwt.js";
import { getIntegerValue } from "../system-parameters/system-parameters.service.js";
import type { AuthTokens, UserPublic } from "./auth.types.js";

/** Multi-role lookup - unlike SICOT's single `role` column, roles live in a
 *  join table (user_roles) so a user can hold more than one at once. */
export async function getRolesForUser(userId: number): Promise<string[]> {
  const rows = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role);
}

export async function handleFailedLogin(userId: number, currentFailedAttempts: number): Promise<void> {
  const attempts = currentFailedAttempts + 1;
  const updates: Record<string, unknown> = { failedAttempts: attempts };

  const maxAttempts = await getIntegerValue("lockout_max_attempts", 5);
  if (attempts >= maxAttempts) {
    const lockoutDuration = await getIntegerValue("lockout_duration_minutes", 30);
    const lockedUntil = new Date();
    lockedUntil.setMinutes(lockedUntil.getMinutes() + lockoutDuration);
    updates.lockedUntil = lockedUntil;
  }

  await db.update(users).set(updates).where(eq(users.id, userId));
}

export async function resetFailedAttempts(userId: number): Promise<void> {
  await db
    .update(users)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(eq(users.id, userId));
}

export async function buildTokens(user: { id: number; employeeCode: string }): Promise<AuthTokens> {
  const roles = await getRolesForUser(user.id);
  const payload: TokenPayload = { userId: user.id, employeeCode: user.employeeCode, roles };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export async function buildUserPublic(user: {
  id: number;
  employeeCode: string;
  fullName: string;
}): Promise<UserPublic> {
  const roles = await getRolesForUser(user.id);
  return { id: user.id, employeeCode: user.employeeCode, fullName: user.fullName, roles };
}
