import { eq, ilike, or, and, desc } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import { users, userRoles, internalRoleEnum } from "../../shared/db/schema.js";
import { generateOTP, hashOTP, otpExpiresAt } from "../../shared/utils/otp.js";
import { sendOTPEmail } from "../../shared/utils/email.js";
import { logAudit } from "../auth/auth.service.js";
import { getCanonicalEmployeeCodeForUserCreation } from "../personnel-anac/personnel-anac.service.js";
import { toUserView } from "./users.helpers.js";
import type { CreateUserParams, UpdateUserParams, UserFilters, UserView } from "./users.types.js";

export type { CreateUserParams, UpdateUserParams, UserFilters, UserView } from "./users.types.js";

export async function listUsers(filters: UserFilters): Promise<{ data: UserView[]; total: number }> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (filters.search) {
    conditions.push(
      or(
        ilike(users.employeeCode, `%${filters.search}%`),
        ilike(users.fullName, `%${filters.search}%`)
      )
    );
  }
  if (filters.active !== undefined) {
    conditions.push(eq(users.active, filters.active));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const allUsers = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(pageSize)
    .offset(offset);

  const total = await db.$count(users, where);
  const data = await Promise.all(allUsers.map(toUserView));

  // Optional role filter applied after roles are resolved (roles live in a
  // join table, not a column, so this can't be pushed into the SQL where
  // clause without a join - acceptable at this scale).
  const filtered = filters.role ? data.filter((u) => u.roles.includes(filters.role!)) : data;

  return { data: filtered, total };
}

export async function getUser(id: number): Promise<UserView> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) throw new Error("USER_NOT_FOUND");
  return toUserView(user);
}

/** Creates a user with firstLogin=true and sends them an OTP - mirrors
 *  SICOT's create-user flow exactly, adapted for multi-role. */
export async function createUser(
  params: CreateUserParams
): Promise<{ user: UserView; emailSent: boolean }> {
  const employeeCode = await getCanonicalEmployeeCodeForUserCreation(params.employeeCode);

  const [existing] = await db.select().from(users).where(eq(users.employeeCode, employeeCode));
  if (existing) throw new Error("EMPLOYEE_CODE_EXISTS");

  const [existingEmail] = await db.select().from(users).where(eq(users.email, params.email));
  if (existingEmail) throw new Error("EMAIL_EXISTS");

  const otp = generateOTP();
  const otpHash = await hashOTP(otp);
  const expiresAt = otpExpiresAt(15);

  const [newUser] = await db
    .insert(users)
    .values({
      employeeCode,
      fullName: params.fullName,
      email: params.email,
      active: true,
      firstLogin: true,
      otpHash,
      otpExpiresAt: expiresAt,
    })
    .returning();

  for (const role of params.roles) {
    await db.insert(userRoles).values({ userId: newUser.id, role: role as (typeof userRoles.$inferInsert)["role"] });
  }

  let emailSent = true;
  try {
    await sendOTPEmail({
      to: newUser.email,
      fullName: newUser.fullName,
      employeeCode: newUser.employeeCode,
      otp,
    });
  } catch (error) {
    emailSent = false;
    console.error("[email] Failed to send OTP (user creation):", error);
  }

  await logAudit({
    userId: params.createdByUserId,
    action: "USER_CREATED",
    module: "M13",
    entityId: newUser.id,
    details: { employeeCode: newUser.employeeCode, roles: params.roles },
  });

  return { user: await toUserView(newUser), emailSent };
}

export async function updateUser(id: number, params: UpdateUserParams): Promise<UserView> {
  const [existing] = await db.select().from(users).where(eq(users.id, id));
  if (!existing) throw new Error("USER_NOT_FOUND");

  if (params.email !== undefined && params.email !== existing.email) {
    const [emailTaken] = await db.select().from(users).where(eq(users.email, params.email));
    if (emailTaken) throw new Error("EMAIL_EXISTS");
  }

  const updates: Partial<typeof users.$inferInsert> = {};
  if (params.active !== undefined) updates.active = params.active;
  if (params.email !== undefined) updates.email = params.email;

  const [updated] = await db
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  if (params.roles !== undefined) {
    await db.delete(userRoles).where(eq(userRoles.userId, id));
    for (const role of params.roles) {
      await db.insert(userRoles).values({ userId: id, role: role as (typeof userRoles.$inferInsert)["role"] });
    }
  }

  await logAudit({
    userId: params.updatedByUserId,
    action: "USER_UPDATED",
    module: "M13",
    entityId: id,
    details: { ...updates, roles: params.roles },
  });

  return toUserView(updated);
}

/** SU cannot be deactivated - there must always be at least one operable
 *  Super Admin account. */
export async function toggleActivation(id: number, active: boolean, adminId: number): Promise<UserView> {
  const [existing] = await db.select().from(users).where(eq(users.id, id));
  if (!existing) throw new Error("USER_NOT_FOUND");

  if (!active) {
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, id));
    if (roles.some((r) => r.role === "SU")) {
      throw new Error("SU_CANNOT_BE_DEACTIVATED");
    }
  }

  const [updated] = await db
    .update(users)
    .set({ active, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  await logAudit({
    userId: adminId,
    action: active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    module: "M13",
    entityId: id,
  });

  return toUserView(updated);
}

export async function resetOTP(id: number, adminId: number): Promise<{ emailSent: boolean }> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) throw new Error("USER_NOT_FOUND");
  if (!user.active) throw new Error("ACCOUNT_INACTIVE");

  const otp = generateOTP();
  const otpHash = await hashOTP(otp);
  const expiresAt = otpExpiresAt(15);

  await db
    .update(users)
    .set({
      otpHash,
      otpExpiresAt: expiresAt,
      firstLogin: true,
      passwordHash: null,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));

  let emailSent = true;
  try {
    await sendOTPEmail({ to: user.email, fullName: user.fullName, employeeCode: user.employeeCode, otp });
  } catch (error) {
    emailSent = false;
    console.error("[email] Failed to send OTP (reset):", error);
  }

  await logAudit({ userId: adminId, action: "OTP_RESET", module: "M13", entityId: id });

  return { emailSent };
}

/** Minimal, least-privilege lookup used by other modules to populate agent
 *  pickers (e.g. M6 site visit scheduling needs to list r3_agent users)
 *  without exposing full user records (email, active flag, etc.) to callers
 *  who aren't SU. Active users only. */
export async function listActiveUsersByRole(
  role: string
): Promise<{ id: number; fullName: string; employeeCode: string }[]> {
  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      employeeCode: users.employeeCode,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(userRoles.role, role as (typeof internalRoleEnum.enumValues)[number]), eq(users.active, true)));

  return rows;
}
