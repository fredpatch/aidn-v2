import { eq, inArray } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { users } from '../../shared/db/schema.js';
import * as personnelAnac from '../../shared/utils/personnel-anac.js';
import type { PersonnelAnacRaw } from '../../shared/utils/personnel-anac.types.js';

export interface PersonnelAnacView {
  employeeCode: string;
  lastName: string | null;
  firstName: string | null;
  fullName: string;
  organisationLabel: string | null;
  hasAccount: boolean;
}

function fullName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim();
}

function normalizeEmployeeCode(value: string | number): string {
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) throw new Error('INVALID_EMPLOYEE_CODE');
  return raw.padStart(4, '0');
}

function normalize(raw: PersonnelAnacRaw, existingCodes: Set<string>): PersonnelAnacView {
  const { service, direction, function: jobFunction } = raw.organization;
  const organisationLabel =
    [service?.name, direction?.name, jobFunction?.name].filter(Boolean).join(' - ') || null;
  const employeeCode = normalizeEmployeeCode(raw.identity.matricule);

  return {
    employeeCode,
    lastName: raw.identity.lastName,
    firstName: raw.identity.firstName,
    fullName: fullName(raw.identity.firstName, raw.identity.lastName),
    organisationLabel,
    hasAccount: existingCodes.has(employeeCode),
  };
}

async function existingEmployeeCodes(codes: string[]): Promise<Set<string>> {
  if (codes.length === 0) return new Set();

  const rows = await db
    .select({ employeeCode: users.employeeCode })
    .from(users)
    .where(inArray(users.employeeCode, codes));

  return new Set(rows.map((row) => row.employeeCode));
}

async function normalizeList(rawRows: PersonnelAnacRaw[]): Promise<PersonnelAnacView[]> {
  const codes = rawRows.map((row) => normalizeEmployeeCode(row.identity.matricule));
  const existingCodes = await existingEmployeeCodes(codes);
  return rawRows.map((row) => normalize(row, existingCodes));
}

export async function search(q: string): Promise<PersonnelAnacView[]> {
  if (q.trim().length < 2) throw new Error('PERSONNEL_SEARCH_TOO_SHORT');
  const results = await personnelAnac.searchPersonnel(q.trim());
  return normalizeList(results);
}

export async function getByEmployeeCode(employeeCode: string): Promise<PersonnelAnacView> {
  const normalizedEmployeeCode = normalizeEmployeeCode(employeeCode);

  const raw = await personnelAnac.getPersonnelByEmployeeCode(normalizedEmployeeCode);
  const [view] = await normalizeList([raw]);
  return view;
}

export async function list(
  page: number,
  limit: number,
  sortBy: 'id' | 'lastName',
  order: 'asc' | 'desc'
): Promise<{ data: PersonnelAnacView[]; total: number; page: number; limit: number }> {
  const { data, meta } = await personnelAnac.listPersonnel(page, limit, sortBy, order);
  return { data: await normalizeList(data), total: meta.total, page: meta.page, limit: meta.limit };
}

export async function assertExistsForUserCreation(employeeCode: string): Promise<void> {
  await getByEmployeeCode(employeeCode);
}

export async function getCanonicalEmployeeCodeForUserCreation(employeeCode: string): Promise<string> {
  if (process.env.PERSONNEL_ANAC_ENFORCE === 'false') {
    return normalizeEmployeeCode(employeeCode);
  }

  const personnel = await getByEmployeeCode(employeeCode);
  return personnel.employeeCode;
}
