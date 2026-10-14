import { internalRoleEnum } from "../../shared/db/schema.js";

export type InternalRoleValue = (typeof internalRoleEnum.enumValues)[number];

export function assertValidRoles(roles: string[]): asserts roles is InternalRoleValue[] {
  if (roles.length === 0) throw new Error("ROLES_REQUIRED");

  const allowedRoles = new Set<string>(internalRoleEnum.enumValues);
  const uniqueRoles = new Set(roles);
  if (uniqueRoles.size !== roles.length || roles.some((role) => !allowedRoles.has(role))) {
    throw new Error("INVALID_ROLE");
  }
}
