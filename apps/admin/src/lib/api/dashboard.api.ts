import { api } from '../axios';
import type { DashboardPeriod, DashboardSummary } from './dashboard.types';

export async function fetchDashboardSummary(
  period: DashboardPeriod = 'this_month'
): Promise<DashboardSummary> {
  const { data } = await api.get<DashboardSummary>('/dashboard/summary', {
    params: { period },
  });
  return data;
}
