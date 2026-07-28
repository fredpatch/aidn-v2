import type { PersonnelAnacListMeta, PersonnelAnacRaw } from './personnel-anac.types.js';

export type { PersonnelAnacListMeta, PersonnelAnacRaw } from './personnel-anac.types.js';

const BASE_URL = process.env.PERSONNEL_ANAC_BASE_URL ?? 'http://100.110.227.69:4005';
const API_KEY = process.env.PERSONNEL_ANAC_API_KEY ?? '';
const TIMEOUT_MS = 5000;

async function request<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: API_KEY ? { 'x-api-key': API_KEY } : undefined,
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('PERSONNEL_ANAC_AUTH_INVALID');
    }
    if (response.status === 404) {
      throw new Error('PERSONNEL_NOT_FOUND');
    }
    if (response.status === 429) {
      throw new Error('PERSONNEL_ANAC_RATE_LIMITED');
    }
    if (!response.ok) {
      throw new Error('PERSONNEL_ANAC_UNKNOWN_ERROR');
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === 'PERSONNEL_ANAC_AUTH_INVALID' ||
        error.message === 'PERSONNEL_NOT_FOUND' ||
        error.message === 'PERSONNEL_ANAC_RATE_LIMITED' ||
        error.message === 'PERSONNEL_ANAC_UNKNOWN_ERROR'
      ) {
        throw error;
      }
      if (error.name === 'AbortError' || error.message.includes('fetch failed')) {
        throw new Error('PERSONNEL_ANAC_UNAVAILABLE');
      }
    }
    console.error('[personnel-anac] Unexpected error:', error);
    throw new Error('PERSONNEL_ANAC_UNKNOWN_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchPersonnel(q: string, limit = 20): Promise<PersonnelAnacRaw[]> {
  const response = await request<{ data: PersonnelAnacRaw[] }>('/api/v1/personnel/search', {
    q,
    limit,
  });
  return response.data;
}

export async function getPersonnelByEmployeeCode(employeeCode: string): Promise<PersonnelAnacRaw> {
  const response = await request<{ data: PersonnelAnacRaw }>(
    `/api/v1/personnel/matricule/${encodeURIComponent(employeeCode)}`
  );
  return response.data;
}

export async function listPersonnel(
  page = 1,
  limit = 20,
  sortBy: 'id' | 'lastName' = 'lastName',
  order: 'asc' | 'desc' = 'asc'
): Promise<{ data: PersonnelAnacRaw[]; meta: PersonnelAnacListMeta }> {
  const response = await request<{ data: PersonnelAnacRaw[]; meta: PersonnelAnacListMeta }>(
    '/api/v1/personnel',
    { page, limit, sortBy, order }
  );
  return { data: response.data, meta: response.meta };
}
