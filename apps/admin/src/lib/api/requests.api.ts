import { api } from '../axios';
import type { RequestCockpitSummary } from './requests.types';

export async function fetchRequestCockpit(): Promise<RequestCockpitSummary> {
  const { data } = await api.get('/requests/cockpit');
  return data;
}

/** D3b - the reading pane opened this dossier (« non lues » per agent). */
export async function markRequestViewed(requestId: number): Promise<void> {
  await api.post(`/requests/${requestId}/view`);
}

export async function startPreliminaryPhase(requestId: number): Promise<void> {
  await api.post(`/phases/requests/${requestId}/start-preliminary-phase`);
}
