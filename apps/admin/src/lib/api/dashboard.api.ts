import { api } from '../axios';
import type {
  DashboardPeriod,
  DashboardSummary,
  R3DashboardSummary,
  ReceptionDashboardSummary,
  S5DashboardSummary,
} from './dashboard.types';

export async function fetchDashboardSummary(
  period: DashboardPeriod = 'this_month'
): Promise<DashboardSummary> {
  const { data } = await api.get<DashboardSummary>('/dashboard/summary', {
    params: { period },
  });
  return data;
}

export async function fetchS5DashboardSummary(
  period: DashboardPeriod = 'this_month'
): Promise<S5DashboardSummary> {
  const { data } = await api.get<S5DashboardSummary>('/dashboard/s5-summary', {
    params: { period },
  });
  return data;
}

export async function fetchReceptionDashboardSummary(
  period: DashboardPeriod = 'this_month'
): Promise<ReceptionDashboardSummary> {
  const { data } = await api.get<ReceptionDashboardSummary>('/dashboard/reception-summary', {
    params: { period },
  });
  return data;
}

export async function fetchR3DashboardSummary(
  period: DashboardPeriod = 'this_month'
): Promise<R3DashboardSummary> {
  const { data } = await api.get<R3DashboardSummary>('/dashboard/r3-summary', {
    params: { period },
  });
  return data;
}
