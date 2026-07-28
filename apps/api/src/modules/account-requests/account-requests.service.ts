import bcrypt from 'bcryptjs';
import { eq, ilike, or, desc } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { accountRequests, applicants, organisations } from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import type {
  AccountRequestView,
  ApplicantAccountView,
  ApproveAccountRequestParams,
  OrganisationCandidate,
  RejectAccountRequestParams,
  SubmitAccountRequestParams,
} from './account-requests.types.js';

const MIN_FORM_ELAPSED_MS = 3000;

function normalizeOrganisationName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function cleanEmail(email: string): string {
  return email.trim().toLowerCase();
}

function acronymForOrganisationName(value: string): string {
  return normalizeOrganisationName(value)
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('');
}

function isUniqueViolation(error: unknown): boolean {
  const pgCode = (error as { code?: string })?.code;
  const causeCode = (error as { cause?: { code?: string } })?.cause?.code;
  return pgCode === '23505' || causeCode === '23505';
}

async function findOrganisationCandidates(
  organisationNameInput: string,
  originalApprovalNumber?: string | null
): Promise<OrganisationCandidate[]> {
  const normalizedName = normalizeOrganisationName(organisationNameInput);
  const normalizedAcronym = normalizedName.replace(/\s+/g, '');
  const nameParts = normalizedName.split(' ').filter((part) => part.length >= 3).slice(0, 3);
  const conditions = [
    eq(organisations.normalizedName, normalizedName),
    ilike(organisations.name, `%${organisationNameInput.trim()}%`),
    ilike(organisations.normalizedName, `%${normalizedName}%`),
  ];

  for (const part of nameParts) {
    conditions.push(ilike(organisations.normalizedName, `%${part}%`));
  }

  if (originalApprovalNumber?.trim()) {
    conditions.push(
      ilike(organisations.originalApprovalNumber, `%${originalApprovalNumber.trim()}%`)
    );
  }

  const rows = await db
    .select()
    .from(organisations)
    .where(or(...conditions))
    .limit(8);

  const acronymRows =
    normalizedAcronym.length >= 2 && normalizedAcronym.length <= 8
      ? (await db.select().from(organisations).limit(200)).filter(
          (row) => acronymForOrganisationName(row.name) === normalizedAcronym
        )
      : [];

  const byId = new Map([...acronymRows, ...rows].map((row) => [row.id, row]));

  return [...byId.values()].slice(0, 8).map((row) => {
    let matchReason = 'Nom similaire';
    if (acronymForOrganisationName(row.name) === normalizedAcronym) {
      matchReason = 'Sigle/acronyme correspondant';
    } else if (row.normalizedName === normalizedName) matchReason = 'Nom normalise identique';
    else if (
      originalApprovalNumber?.trim() &&
      row.originalApprovalNumber
        ?.toLowerCase()
        .includes(originalApprovalNumber.trim().toLowerCase())
    ) {
      matchReason = "Numero d'agrement proche";
    }

    return {
      id: row.id,
      name: row.name,
      normalizedName: row.normalizedName,
      legalAddress: row.legalAddress,
      email: row.email,
      phone: row.phone,
      originalApprovalNumber: row.originalApprovalNumber,
      active: row.active,
      matchReason,
    };
  });
}

export async function searchOrganisations(query: string): Promise<OrganisationCandidate[]> {
  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeOrganisationName(trimmedQuery);
  const compactQuery = normalizedQuery.replace(/\s+/g, '');
  if (normalizedQuery.length < 2) return [];

  const parts = normalizedQuery.split(' ').filter((part) => part.length >= 2).slice(0, 4);
  const conditions = [
    ilike(organisations.name, `%${trimmedQuery}%`),
    ilike(organisations.normalizedName, `%${normalizedQuery}%`),
    ilike(organisations.originalApprovalNumber, `%${trimmedQuery}%`),
  ];

  for (const part of parts) {
    conditions.push(ilike(organisations.normalizedName, `%${part}%`));
  }

  const rows = await db
    .select()
    .from(organisations)
    .where(or(...conditions))
    .limit(20);

  const acronymRows =
    compactQuery.length >= 2 && compactQuery.length <= 8
      ? (await db.select().from(organisations).limit(300)).filter(
          (row) => acronymForOrganisationName(row.name) === compactQuery
        )
      : [];

  const byId = new Map([...acronymRows, ...rows].map((row) => [row.id, row]));

  return [...byId.values()].slice(0, 20).map((row) => ({
    id: row.id,
    name: row.name,
    normalizedName: row.normalizedName,
    legalAddress: row.legalAddress,
    email: row.email,
    phone: row.phone,
    originalApprovalNumber: row.originalApprovalNumber,
    active: row.active,
    matchReason:
      acronymForOrganisationName(row.name) === compactQuery
        ? 'Sigle/acronyme correspondant'
        : 'Recherche manuelle',
  }));
}

async function toAccountRequestView(
  row: typeof accountRequests.$inferSelect
): Promise<AccountRequestView> {
  return {
    id: row.id,
    organisationNameInput: row.organisationNameInput,
    legalAddress: row.legalAddress,
    requestedEmail: row.requestedEmail,
    phone: row.phone,
    originalApprovalNumber: row.originalApprovalNumber,
    contactFullName: row.contactFullName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    matchedOrganisationId: row.matchedOrganisationId,
    status: row.status,
    rejectionReason: row.rejectionReason,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    submittedAt: row.submittedAt,
    candidates: await findOrganisationCandidates(row.organisationNameInput, row.originalApprovalNumber),
  };
}

export async function submitAccountRequest(
  params: SubmitAccountRequestParams
): Promise<AccountRequestView> {
  if (params.honeypot?.trim()) throw new Error('ACCOUNT_REQUEST_REJECTED');
  if (Date.now() - params.formStartedAt.getTime() < MIN_FORM_ELAPSED_MS) {
    throw new Error('ACCOUNT_REQUEST_TOO_FAST');
  }
  if (params.password.length < 8) throw new Error('PASSWORD_TOO_SHORT');

  const contactEmail = cleanEmail(params.contactEmail);
  const requestedEmail = cleanEmail(params.requestedEmail);

  const [existingApplicant] = await db
    .select()
    .from(applicants)
    .where(eq(applicants.email, contactEmail));
  if (existingApplicant) throw new Error('APPLICANT_EMAIL_EXISTS');

  const passwordHash = await bcrypt.hash(params.password, 10);

  try {
    const [request] = await db
      .insert(accountRequests)
      .values({
        organisationNameInput: params.organisationNameInput.trim(),
        legalAddress: params.legalAddress.trim(),
        requestedEmail,
        phone: params.phone?.trim() || null,
        originalApprovalNumber: params.originalApprovalNumber?.trim() || null,
        contactFullName: params.contactFullName.trim(),
        contactEmail,
        contactPhone: params.contactPhone?.trim() || null,
        passwordHash,
        formStartedAt: params.formStartedAt,
      })
      .returning();

    await logAudit({
      action: 'ACCOUNT_REQUEST_SUBMITTED',
      module: 'M13',
      entityId: request.id,
      details: { contactEmail, organisationNameInput: request.organisationNameInput },
    });

    return toAccountRequestView(request);
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error('ACCOUNT_REQUEST_ALREADY_PENDING');
    throw error;
  }
}

export async function listAccountRequests(status = 'pending'): Promise<AccountRequestView[]> {
  const rows = await db
    .select()
    .from(accountRequests)
    .where(eq(accountRequests.status, status as typeof accountRequests.$inferSelect.status))
    .orderBy(desc(accountRequests.submittedAt));

  return Promise.all(rows.map(toAccountRequestView));
}

export async function getAccountRequest(id: number): Promise<AccountRequestView> {
  const [request] = await db.select().from(accountRequests).where(eq(accountRequests.id, id));
  if (!request) throw new Error('ACCOUNT_REQUEST_NOT_FOUND');
  return toAccountRequestView(request);
}

export async function approveAccountRequest(
  id: number,
  params: ApproveAccountRequestParams
): Promise<AccountRequestView> {
  const [request] = await db.select().from(accountRequests).where(eq(accountRequests.id, id));
  if (!request) throw new Error('ACCOUNT_REQUEST_NOT_FOUND');
  if (request.status !== 'pending') throw new Error('ACCOUNT_REQUEST_ALREADY_REVIEWED');

  const [existingApplicant] = await db
    .select()
    .from(applicants)
    .where(eq(applicants.email, request.contactEmail));
  if (existingApplicant) throw new Error('APPLICANT_EMAIL_EXISTS');

  let organisationId = params.organisationId;
  if (organisationId !== undefined) {
    const [organisation] = await db
      .select()
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    if (!organisation) throw new Error('ORGANISATION_NOT_FOUND');
  } else if (params.createOrganisation) {
    const normalizedName = normalizeOrganisationName(request.organisationNameInput);
    try {
      const [newOrganisation] = await db
        .insert(organisations)
        .values({
          name: request.organisationNameInput,
          normalizedName,
          legalAddress: request.legalAddress,
          phone: request.phone,
          email: request.requestedEmail,
          originalApprovalNumber: request.originalApprovalNumber,
        })
        .returning();
      organisationId = newOrganisation.id;
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error('ORGANISATION_ALREADY_EXISTS');
      throw error;
    }
  } else {
    throw new Error('ORGANISATION_REVIEW_REQUIRED');
  }

  await db.insert(applicants).values({
    organisationId: organisationId!,
    fullName: request.contactFullName,
    email: request.contactEmail,
    phone: request.contactPhone,
    passwordHash: request.passwordHash,
    contactOrder: params.contactOrder,
    active: true,
  });

  const [updated] = await db
    .update(accountRequests)
    .set({
      status: 'approved',
      matchedOrganisationId: organisationId!,
      reviewedBy: params.reviewedBy,
      reviewedAt: new Date(),
    })
    .where(eq(accountRequests.id, id))
    .returning();

  await logAudit({
    userId: params.reviewedBy,
    action: 'ACCOUNT_REQUEST_APPROVED',
    module: 'M13',
    entityId: id,
    details: { organisationId },
  });

  return toAccountRequestView(updated);
}

export async function rejectAccountRequest(
  id: number,
  params: RejectAccountRequestParams
): Promise<AccountRequestView> {
  const rejectionReason = params.rejectionReason.trim();
  if (!rejectionReason) throw new Error('REJECTION_REASON_REQUIRED');

  const [request] = await db.select().from(accountRequests).where(eq(accountRequests.id, id));
  if (!request) throw new Error('ACCOUNT_REQUEST_NOT_FOUND');
  if (request.status !== 'pending') throw new Error('ACCOUNT_REQUEST_ALREADY_REVIEWED');

  const [updated] = await db
    .update(accountRequests)
    .set({
      status: 'rejected',
      rejectionReason,
      reviewedBy: params.reviewedBy,
      reviewedAt: new Date(),
    })
    .where(eq(accountRequests.id, id))
    .returning();

  await logAudit({
    userId: params.reviewedBy,
    action: 'ACCOUNT_REQUEST_REJECTED',
    module: 'M13',
    entityId: id,
    details: { rejectionReason },
  });

  return toAccountRequestView(updated);
}

export async function listApplicantAccounts(): Promise<ApplicantAccountView[]> {
  const rows = await db
    .select({
      id: applicants.id,
      organisationId: applicants.organisationId,
      organisationName: organisations.name,
      fullName: applicants.fullName,
      email: applicants.email,
      phone: applicants.phone,
      contactOrder: applicants.contactOrder,
      active: applicants.active,
      createdAt: applicants.createdAt,
    })
    .from(applicants)
    .innerJoin(organisations, eq(applicants.organisationId, organisations.id))
    .orderBy(desc(applicants.createdAt));

  return rows;
}

export async function setApplicantAccountActive(
  id: number,
  active: boolean,
  reviewedBy: number
): Promise<ApplicantAccountView> {
  const [existing] = await db.select().from(applicants).where(eq(applicants.id, id));
  if (!existing) throw new Error('APPLICANT_NOT_FOUND');

  await db
    .update(applicants)
    .set({ active })
    .where(eq(applicants.id, id));

  await logAudit({
    userId: reviewedBy,
    action: active ? 'APPLICANT_ACCOUNT_ACTIVATED' : 'APPLICANT_ACCOUNT_DEACTIVATED',
    module: 'M13',
    entityId: id,
  });

  const account = (await listApplicantAccounts()).find((row) => row.id === id);
  if (!account) throw new Error('APPLICANT_NOT_FOUND');
  return account;
}
