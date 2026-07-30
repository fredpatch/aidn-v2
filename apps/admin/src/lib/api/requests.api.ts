import { api } from '../axios';
import type { RequestCockpitSummary } from './requests.types';

export async function fetchRequestCockpit(): Promise<RequestCockpitSummary> {
  const { data } = await api.get('/requests/cockpit');
  return data;
}

export async function startPreliminaryPhase(requestId: number): Promise<void> {
  await api.post(`/phases/requests/${requestId}/start-preliminary-phase`);
}
