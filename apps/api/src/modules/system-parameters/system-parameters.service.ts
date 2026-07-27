import { eq } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import { systemParameters } from "../../shared/db/schema.js";
import { logAudit } from "../auth/auth.service.js";

export interface ParameterView {
  id: number;
  key: string;
  value: string;
  type: "integer" | "boolean" | "text";
  module: string;
  description: string | null;
}

function toParameterView(row: typeof systemParameters.$inferSelect): ParameterView {
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    type: row.type,
    module: row.module,
    description: row.description,
  };
}

export async function listParameters(module?: string): Promise<ParameterView[]> {
  const rows = module
    ? await db.select().from(systemParameters).where(eq(systemParameters.module, module))
    : await db.select().from(systemParameters);
  return rows.map(toParameterView);
}

/** Used internally by other services (alerts, lockout policy, OTP expiry)
 *  to read a configured threshold, falling back to a hardcoded default if
 *  the row is missing rather than throwing - config should never be a hard
 *  dependency for the app to function. */
export async function getIntegerValue(key: string, fallback: number): Promise<number> {
  const [param] = await db.select().from(systemParameters).where(eq(systemParameters.key, key));
  if (!param) return fallback;
  const n = parseInt(param.value, 10);
  return isNaN(n) ? fallback : n;
}

export async function getBooleanValue(key: string, fallback: boolean): Promise<boolean> {
  const [param] = await db.select().from(systemParameters).where(eq(systemParameters.key, key));
  if (!param) return fallback;
  return param.value === "true";
}

export async function getTextValue(key: string, fallback: string): Promise<string> {
  const [param] = await db.select().from(systemParameters).where(eq(systemParameters.key, key));
  return param ? param.value : fallback;
}

export async function updateParameter(
  key: string,
  value: string,
  updatedByUserId: number
): Promise<ParameterView> {
  const [existing] = await db
    .select()
    .from(systemParameters)
    .where(eq(systemParameters.key, key));
  if (!existing) throw new Error("PARAMETER_NOT_FOUND");

  const [updated] = await db
    .update(systemParameters)
    .set({ value, updatedBy: updatedByUserId, updatedAt: new Date() })
    .where(eq(systemParameters.key, key))
    .returning();

  await logAudit({
    userId: updatedByUserId,
    action: "PARAMETER_UPDATED",
    module: "M13",
    entityId: updated.id,
    details: { key, oldValue: existing.value, newValue: value },
  });

  return toParameterView(updated);
}
