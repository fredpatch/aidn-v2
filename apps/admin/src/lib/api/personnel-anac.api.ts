import { api } from '../axios';
import type { PersonnelAnacListResponse, PersonnelAnacResult } from './personnel-anac.types';

export async function listPersonnelAnac(page = 1, limit = 20): Promise<PersonnelAnacListResponse> {
  const { data } = await api.get('/personnel-anac', { params: { page, limit } });
  return data;
}

export async function searchPersonnelAnac(q: string): Promise<PersonnelAnacResult[]> {
  const { data } = await api.get('/personnel-anac/search', { params: { q } });
  return data.data;
}

