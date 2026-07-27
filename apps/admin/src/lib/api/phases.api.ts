import { api } from '../axios';
import type { PhaseSummaryItem } from './phases.types';

export async function fetchPhasesSummary(requestId: string): Promise<PhaseSummaryItem[]> {
  const { data } = await api.get(`/phases/requests/${requestId}/phases-summary`);
  return data;
}
