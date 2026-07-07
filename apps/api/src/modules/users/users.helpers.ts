import { eq } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import { userRoles } from "../../shared/db/schema.js";
import type { UserView } from "./users.types.js";

export async function toUserView(user: {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  active: boolean;
  firstLogin: boolean;
  createdAt: Date;
}): Promise<UserView> {
  const roleRows = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    email: user.email,
    roles: roleRows.map((r) => r.role),
    active: user.active,
    firstLogin: user.firstLogin,
    createdAt: user.createdAt,
  };
}
