import { api } from '../axios';
import type { DossierState, PhaseSummaryItem } from './phases.types';

export async function fetchPhasesSummary(requestId: string): Promise<PhaseSummaryItem[]> {
  const { data } = await api.get(`/phases/requests/${requestId}/phases-summary`);
  return data;
}

export async function fetchDossierState(requestId: string): Promise<DossierState> {
  const { data } = await api.get(`/phases/requests/${requestId}/dossier-state`);
  return data;
}
