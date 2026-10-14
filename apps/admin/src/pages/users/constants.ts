import { INTERNAL_ROLES, INTERNAL_ROLE_GROUP_LABELS, INTERNAL_ROLE_LABELS } from '@aidn/shared';

/** Business role names live in @aidn/shared (single source for admin/API/reports). */
export const ROLE_LABELS: Record<string, string> = INTERNAL_ROLE_LABELS;
export const ROLE_GROUP_LABELS: Record<string, string> = INTERNAL_ROLE_GROUP_LABELS;

export const ALL_ROLES: string[] = [...INTERNAL_ROLES];
export const USERS_PAGE_SIZE = 10;
export const PERSONNEL_ANAC_PAGE_SIZE = 8;
