/**
 * Module codes used consistently across audit_logs.module and route prefixes.
 * Mirrors the 13 modules locked during the feasibility study
 * (see project/modules-feasibility.md). M2 (Circuit DG) was merged into M1
 * during the feasibility study and is intentionally absent here.
 */
export const MODULE_CODES = {
  M1: "intake-circuit-dg",
  M3: "preliminary-phase",
  M4: "formal-request-phase",
  M5: "in-depth-evaluation-phase",
  M6: "demonstration-inspection-phase",
  M7: "delivery-phase",
  M8: "documents",
  M9: "payments",
  M10: "meetings",
  M11: "notifications",
  M12: "dashboard-reports",
  M13: "administration-roles",
} as const;

export type ModuleCode = keyof typeof MODULE_CODES;
