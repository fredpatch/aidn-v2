import { api } from '../axios';
import type { AnalyticsFilters, AnalyticsOverview } from './analytics.types';

export async function fetchAnalyticsOverview(
  filters: AnalyticsFilters
): Promise<AnalyticsOverview> {
  const { data } = await api.get<AnalyticsOverview>('/analytics/overview', {
    params: {
      periodStart: filters.periodStart || undefined,
      periodEnd: filters.periodEnd || undefined,
      phaseCode: filters.phaseCode || undefined,
      requestType: filters.requestType || undefined,
      status: filters.status || undefined,
    },
  });
  return data;
}
