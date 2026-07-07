import bcrypt from "bcryptjs";
import { eq, count } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import { users, userRoles } from "../../shared/db/schema.js";
import { logAudit } from "../auth/auth.service.js";

const SALT_ROUNDS = 10;

/** The system is considered initialised once at least one SU exists. */
export async function isInitialised(): Promise<boolean> {
  const [result] = await db
    .select({ total: count() })
    .from(userRoles)
    .where(eq(userRoles.role, "SU"));

  return (result?.total ?? 0) > 0;
}

export async function initialiseSuperAdmin(params: {
  employeeCode: string;
  fullName: string;
  email: string;
  password: string;
}): Promise<void> {
  const { employeeCode, fullName, email, password } = params;

  const alreadyInitialised = await isInitialised();
  if (alreadyInitialised) {
    throw new Error("SYSTEM_ALREADY_INITIALISED");
  }

  const [existing] = await db.select().from(users).where(eq(users.employeeCode, employeeCode));
  if (existing) {
    throw new Error("EMPLOYEE_CODE_EXISTS");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const [superAdmin] = await db
    .insert(users)
    .values({
      employeeCode,
      fullName,
      email,
      passwordHash,
      active: true,
      firstLogin: false, // direct login, no OTP needed for the bootstrap account
    })
    .returning();

  await db.insert(userRoles).values({ userId: superAdmin.id, role: "SU" });

  await logAudit({
    userId: superAdmin.id,
    action: "BOOTSTRAP_SU_CREATED",
    module: "M13",
    details: { employeeCode, email },
  });
}
