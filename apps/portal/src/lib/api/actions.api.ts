import type { ApplicantAction } from '@aidn/shared';
import { api } from '../axios';

/** The applicant's required actions across dossiers, already ordered by the API. */
export async function fetchApplicantActions(): Promise<ApplicantAction[]> {
  const { data } = await api.get('/applicant/actions');
  return data;
}
