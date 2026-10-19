/** ROLE-ANALYTICS-1B - role analytics foundation: request validation,
 *  authorization and dispatch to a per-domain provider. The providers come
 *  with ROLE-ANALYTICS-1C (courrier, dn_circuit), 1D (finance) and 1E
 *  (inspection); until a domain has one, the call answers
 *  ROLE_ANALYTICS_NOT_IMPLEMENTED rather than fabricated values. */
import {
  canReadRoleAnalytics,
  isRoleAnalyticsDomain,
  isRoleAnalyticsScope,
  type RoleAnalyticsDomain,
  type RoleAnalyticsOverview,
  type RoleAnalyticsPeriod,
  type RoleAnalyticsScope,
} from '@aidn/shared';
import { resolveAnalyticsPeriod } from './period.js';
import { courrierAnalyticsProvider } from './providers/courrier.provider.js';
import { dnCircuitAnalyticsProvider } from './providers/dn-circuit.provider.js';
import { financeAnalyticsProvider } from './providers/finance.provider.js';

export interface RoleAnalyticsViewer {
  userId: number;
  roles: readonly string[];
}

export interface RoleAnalyticsContext {
  domain: RoleAnalyticsDomain;
  /** 'mine' = actions of `viewer.userId`; 'service' = the whole service. */
  scope: RoleAnalyticsScope;
  period: RoleAnalyticsPeriod;
  viewer: RoleAnalyticsViewer;
  now: Date;
}

export interface RoleAnalyticsProvider {
  getOverview(context: RoleAnalyticsContext): Promise<RoleAnalyticsOverview>;
}

export type RoleAnalyticsRegistry = Partial<Record<RoleAnalyticsDomain, RoleAnalyticsProvider>>;

/** 1C: courrier, dn_circuit; 1D: finance. inspection (1E) still answers 501. */
export const ROLE_ANALYTICS_PROVIDERS: RoleAnalyticsRegistry = {
  courrier: courrierAnalyticsProvider,
  dn_circuit: dnCircuitAnalyticsProvider,
  finance: financeAnalyticsProvider,
};

export interface RoleAnalyticsRequest {
  domain: unknown;
  scope: unknown;
  period: unknown;
  from?: unknown;
  to?: unknown;
}

/** Checks run in this order: domain, scope (400), access (403), period (400),
 *  provider (501). Access is decided before the period so a refused caller
 *  learns nothing about the inputs. */
export async function getRoleAnalyticsOverview(
  request: RoleAnalyticsRequest,
  viewer: RoleAnalyticsViewer,
  registry: RoleAnalyticsRegistry = ROLE_ANALYTICS_PROVIDERS,
  now: Date = new Date()
): Promise<RoleAnalyticsOverview> {
  const { domain, scope } = request;
  if (!isRoleAnalyticsDomain(domain)) throw new Error('INVALID_ANALYTICS_DOMAIN');
  if (!isRoleAnalyticsScope(scope)) throw new Error('INVALID_ANALYTICS_SCOPE');
  if (!canReadRoleAnalytics(viewer.roles, domain, scope)) throw new Error('ROLE_ANALYTICS_FORBIDDEN');
  const period = resolveAnalyticsPeriod({ period: request.period, from: request.from, to: request.to }, now);
  const provider = registry[domain];
  if (!provider) throw new Error('ROLE_ANALYTICS_NOT_IMPLEMENTED');
  return provider.getOverview({ domain, scope, period, viewer, now });
}
