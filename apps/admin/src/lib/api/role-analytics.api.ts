/** ROLE-ANALYTICS-1F - GET /api/analytics/roles/:domain. Types come from
 *  @aidn/shared; the API owns the period semantics (presets and custom
 *  YYYY-MM-DD dates are sent as chosen, never converted here). */
import type { RoleAnalyticsDomain, RoleAnalyticsOverview, RoleAnalyticsPreset, RoleAnalyticsScope } from '@aidn/shared';
import { api } from '../axios';

export interface RoleAnalyticsQuery {
  domain: RoleAnalyticsDomain;
  scope: RoleAnalyticsScope;
  period: RoleAnalyticsPreset;
  /** Inclusive Libreville dates, only with period = custom. */
  from?: string;
  to?: string;
}

export async function getRoleAnalytics(query: RoleAnalyticsQuery): Promise<RoleAnalyticsOverview> {
  const custom = query.period === 'custom';
  const { data } = await api.get<RoleAnalyticsOverview>(`/analytics/roles/${query.domain}`, {
    params: {
      scope: query.scope,
      period: query.period,
      from: custom ? query.from : undefined,
      to: custom ? query.to : undefined,
    },
  });
  return data;
}
