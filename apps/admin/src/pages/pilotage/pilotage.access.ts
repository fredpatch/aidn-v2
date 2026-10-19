/** ROLE-ANALYTICS-1F - which role domains and scopes a user may open, read
 *  from the shared access matrix (the same one the API enforces; the API
 *  stays authoritative). */
import {
  ROLE_ANALYTICS_ACCESS,
  ROLE_ANALYTICS_DOMAINS,
  ROLE_ANALYTICS_SCOPES,
  canReadRoleAnalytics,
  type InternalRole,
  type RoleAnalyticsDomain,
  type RoleAnalyticsScope,
} from '@aidn/shared';

/** Domains the user can read in at least one scope, in the matrix order. */
export function pilotageDomains(roles: readonly string[]): RoleAnalyticsDomain[] {
  return ROLE_ANALYTICS_DOMAINS.filter((domain) =>
    ROLE_ANALYTICS_SCOPES.some((scope) => canReadRoleAnalytics(roles, domain, scope))
  );
}

/** Scopes the user can read in `domain` (mine first). */
export function pilotageScopes(roles: readonly string[], domain: RoleAnalyticsDomain): RoleAnalyticsScope[] {
  return ROLE_ANALYTICS_SCOPES.filter((scope) => canReadRoleAnalytics(roles, domain, scope));
}

/** Every role that opens at least one domain: the /pilotage route and nav entry. */
export const PILOTAGE_ROLES: InternalRole[] = [
  ...new Set(
    ROLE_ANALYTICS_DOMAINS.flatMap((domain) => ROLE_ANALYTICS_SCOPES.flatMap((scope) => ROLE_ANALYTICS_ACCESS[domain][scope]))
  ),
];
