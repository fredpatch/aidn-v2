import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import {
  requests,
  dgCircuitDocuments,
  documentVersions,
  applicants,
  organisations,
  phases,
} from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { generateRequestReference } from './requests.helpers.js';
import type { SubmitRequestParams, RequestView } from './requests.types.js';
import { linkUploadAssetToOwner } from '../uploads/uploads.service.js';

export type { SubmitRequestParams, RequestView } from './requests.types.js';

/** Postgres unique_violation. Thrown by the partial unique index on
 *  requests.organisationId (pattern "one active request per organisation")
 *  or the one on dg_circuit_documents(entityType, requestId).
 *  Drizzle wraps the underlying pg error in a DrizzleQueryError, so the
 *  Postgres error code lives on `error.cause.code`, not `error.code`. */
function isUniqueViolation(error: unknown): boolean {
  const pgCode = (error as { code?: string })?.code;
  const causeCode = (error as { cause?: { code?: string } })?.cause?.code;
  return pgCode === '23505' || causeCode === '23505';
}

async function getCurrentCircuitDocument(circuitDocumentId: number): Promise<{
  fileUrl: string;
  mimeType: string;
} | null> {
  const [document] = await db
    .select()
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.ownerType, 'dg_circuit_document'),
        eq(documentVersions.ownerId, circuitDocumentId),
        eq(documentVersions.isCurrent, true)
      )
    );

  return document ? { fileUrl: document.fileUrl, mimeType: document.mimeType } : null;
}

async function toRequestView(
  row: typeof requests.$inferSelect,
  circuitDoc: typeof dgCircuitDocuments.$inferSelect | null
): Promise<RequestView> {
  const currentDocument = circuitDoc ? await getCurrentCircuitDocument(circuitDoc.id) : null;
  const status = await resolveRequestStatus(row);
  return {
    id: row.id,
    reference: row.reference,
    applicantId: row.applicantId,
    organisationId: row.organisationId,
    requestType: row.requestType,
    message: row.message,
    status,
    rejectionReason: row.rejectionReason,
    circuitStatus: circuitDoc?.status ?? null,
    circuitDocumentUrl: currentDocument?.fileUrl ?? null,
    circuitDocumentMimeType: currentDocument?.mimeType ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function resolveRequestStatus(row: typeof requests.$inferSelect): Promise<string> {
  if (['completed', 'rejected', 'cancelled'].includes(row.status)) return row.status;

  const [deliveryPhase] = await db
    .select({ status: phases.status })
    .from(phases)
    .where(and(eq(phases.requestId, row.id), eq(phases.phaseCode, 'M7')));

  if (deliveryPhase?.status === 'closed') return 'completed';
  return row.status;
}

/** M1 - submits a new demande. Works identically whether it came through the
 *  portal or was entered manually by reception/assistant_dg for a physical
 *  drop-off - see cross-cutting pattern "Circuit DG". */
export async function submitRequest(params: SubmitRequestParams): Promise<RequestView> {
  const [applicant] = await db
    .select()
    .from(applicants)
    .where(eq(applicants.id, params.applicantId));
  if (!applicant) throw new Error('APPLICANT_NOT_FOUND');

  const [organisation] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, applicant.organisationId));
  if (!organisation) throw new Error('APPLICANT_NOT_FOUND');

  const reference = await generateRequestReference(organisation.id, organisation.normalizedName);

  try {
    const [request] = await db
      .insert(requests)
      .values({
        reference,
        applicantId: applicant.id,
        organisationId: organisation.id,
        requestType: params.requestType,
        message: params.message,
        status: 'submitted',
      })
      .returning();

    const [circuitDoc] = await db
      .insert(dgCircuitDocuments)
      .values({
        entityType: 'intake_request',
        requestId: request.id,
        status: 'submitted',
      })
      .returning();

    await db.insert(documentVersions).values({
      ownerType: 'dg_circuit_document',
      ownerId: circuitDoc.id,
      fileUrl: params.fileUrl,
      mimeType: params.mimeType,
      uploadedBy: params.submittedByUserId,
      isCurrent: true,
    });

    await linkUploadAssetToOwner({
      uploadAssetId: params.uploadAssetId,
      ownerType: 'dg_circuit_document',
      ownerId: circuitDoc.id,
      expectedFileUrl: params.fileUrl,
    });

    await logAudit({
      userId: params.submittedByUserId,
      action: 'REQUEST_SUBMITTED',
      module: 'M1',
      entityId: request.id,
      details: { reference, requestType: params.requestType },
    });

    return toRequestView(request, circuitDoc);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('REQUEST_ALREADY_ACTIVE');
    }
    throw error;
  }
}

export async function getRequest(requestId: number): Promise<RequestView> {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');

  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));

  return toRequestView(request, circuitDoc ?? null);
}

export async function listRequests(filters: { status?: string }): Promise<RequestView[]> {
  const rows = filters.status
    ? await db
        .select()
        .from(requests)
        .where(eq(requests.status, filters.status as typeof requests.$inferSelect.status))
        .orderBy(desc(requests.createdAt))
    : await db.select().from(requests).orderBy(desc(requests.createdAt));

  const withCircuit = await Promise.all(
    rows.map(async (row) => {
      const [circuitDoc] = await db
        .select()
        .from(dgCircuitDocuments)
        .where(eq(dgCircuitDocuments.requestId, row.id));
      return toRequestView(row, circuitDoc ?? null);
    })
  );

  return withCircuit;
}

export async function sendToSignature(requestId: number, actorUserId: number): Promise<RequestView> {
  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));
  if (!circuitDoc) throw new Error('DG_CIRCUIT_NOT_FOUND');
  if (circuitDoc.status !== 'submitted') throw new Error('INVALID_CIRCUIT_TRANSITION');

  const [updatedCircuitDoc] = await db
    .update(dgCircuitDocuments)
    .set({ status: 'in_signature_circuit', signatureSentAt: new Date() })
    .where(eq(dgCircuitDocuments.id, circuitDoc.id))
    .returning();

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');

  await logAudit({
    userId: actorUserId,
    action: 'DG_CIRCUIT_SENT_TO_SIGNATURE',
    module: 'M1',
    entityId: requestId,
  });

  return toRequestView(request, updatedCircuitDoc);
}

/** Legacy fallback for records already in the old two-step state. New M1 intake
 *  uses sendToSignature() then returnSignedFromDg(). */
export async function markSigned(requestId: number, actorUserId: number): Promise<RequestView> {
  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));
  if (!circuitDoc) throw new Error('DG_CIRCUIT_NOT_FOUND');
  if (circuitDoc.status !== 'submitted') throw new Error('INVALID_CIRCUIT_TRANSITION');

  await db
    .update(dgCircuitDocuments)
    .set({ status: 'signed', signedAt: new Date() })
    .where(eq(dgCircuitDocuments.id, circuitDoc.id));

  const [request] = await db
    .update(requests)
    .set({ status: 'signed', updatedAt: new Date() })
    .where(eq(requests.id, requestId))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'DG_CIRCUIT_SIGNED',
    module: 'M1',
    entityId: requestId,
  });

  const updatedCircuitDoc = { ...circuitDoc, status: 'signed' } as typeof circuitDoc;
  return toRequestView(request, updatedCircuitDoc);
}

/** Pattern "Circuit DG" - Signe -> En attente de traitement. DN can now
 *  start working the dossier (Phase 1 creation is a separate module). */
export async function markPendingReview(
  requestId: number,
  actorUserId: number
): Promise<RequestView> {
  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));
  if (!circuitDoc) throw new Error('DG_CIRCUIT_NOT_FOUND');
  if (circuitDoc.status !== 'signed') throw new Error('INVALID_CIRCUIT_TRANSITION');

  await db
    .update(dgCircuitDocuments)
    .set({ status: 'pending_review', pendingReviewAt: new Date() })
    .where(eq(dgCircuitDocuments.id, circuitDoc.id));

  const [request] = await db
    .update(requests)
    .set({ status: 'pending_review', updatedAt: new Date() })
    .where(eq(requests.id, requestId))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'DG_CIRCUIT_PENDING_REVIEW',
    module: 'M1',
    entityId: requestId,
  });

  const updatedCircuitDoc = { ...circuitDoc, status: 'pending_review' } as typeof circuitDoc;
  return toRequestView(request, updatedCircuitDoc);
}

export async function returnSignedFromDg(
  requestId: number,
  newFileUrl: string,
  mimeType: string,
  actorUserId: number,
  uploadAssetId?: number
): Promise<RequestView> {
  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));
  if (!circuitDoc) throw new Error('DG_CIRCUIT_NOT_FOUND');
  if (circuitDoc.status !== 'in_signature_circuit') throw new Error('INVALID_CIRCUIT_TRANSITION');

  await replaceCircuitDocument(requestId, newFileUrl, mimeType, actorUserId, uploadAssetId);

  const now = new Date();
  const [updatedCircuitDoc] = await db
    .update(dgCircuitDocuments)
    .set({ status: 'pending_review', signedAt: now, pendingReviewAt: now })
    .where(eq(dgCircuitDocuments.id, circuitDoc.id))
    .returning();

  const [request] = await db
    .update(requests)
    .set({ status: 'pending_review', updatedAt: now })
    .where(eq(requests.id, requestId))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'DG_CIRCUIT_SIGNED_RETURNED',
    module: 'M1',
    entityId: requestId,
  });

  return toRequestView(request, updatedCircuitDoc);
}

/** Cancellable only while still in Depose - locked the instant DG signs it.
 *  Releases the "one active request" rule immediately. */
/** Cancellable only while still in Depose (checked above). Can be called
 *  either by staff (on the postulant's behalf) or by the applicant
 *  themselves - when it's the applicant, ownership is enforced: they can
 *  only cancel their own demande. */
export async function cancelRequest(
  requestId: number,
  actor: { userId?: number; applicantId?: number }
): Promise<RequestView> {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');

  if (actor.applicantId !== undefined && request.applicantId !== actor.applicantId) {
    throw new Error('REQUEST_NOT_FOUND'); // don't leak existence of someone else's request
  }

  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));
  if (!circuitDoc) throw new Error('DG_CIRCUIT_NOT_FOUND');
  if (circuitDoc.status !== 'submitted') throw new Error('REQUEST_NOT_CANCELLABLE');

  const [updated] = await db
    .update(requests)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(requests.id, requestId))
    .returning();

  await logAudit({
    userId: actor.userId,
    action: 'REQUEST_CANCELLED',
    module: 'M1',
    entityId: requestId,
    details: actor.applicantId ? { cancelledByApplicant: actor.applicantId } : undefined,
  });

  return toRequestView(updated, circuitDoc);
}

/** M1 - "my current demande" for the portal. At most one non-terminal
 *  request exists per applicant's organisation (see the "one active
 *  request" rule), but history (cancelled/rejected/completed) is included
 *  too so the applicant can see what happened to past attempts. */
export async function listRequestsByApplicant(applicantId: number): Promise<RequestView[]> {
  const rows = await db
    .select()
    .from(requests)
    .where(eq(requests.applicantId, applicantId))
    .orderBy(desc(requests.createdAt));

  return Promise.all(
    rows.map(async (row) => {
      const [circuitDoc] = await db
        .select()
        .from(dgCircuitDocuments)
        .where(eq(dgCircuitDocuments.requestId, row.id));
      return toRequestView(row, circuitDoc ?? null);
    })
  );
}

/** M8 pattern - replace a mis-scanned document. The old version goes to
 *  trash (isCurrent=false, trashedAt set), never deleted outright. Both
 *  versions stay visible to applicant and DN per the M8 decision. */
export async function replaceCircuitDocument(
  requestId: number,
  newFileUrl: string,
  mimeType: string,
  actorUserId: number,
  uploadAssetId?: number
): Promise<void> {
  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));
  if (!circuitDoc) throw new Error('DG_CIRCUIT_NOT_FOUND');

  await db
    .update(documentVersions)
    .set({ isCurrent: false, trashedAt: new Date() })
      .where(
        and(
          eq(documentVersions.ownerType, 'dg_circuit_document'),
          eq(documentVersions.ownerId, circuitDoc.id)
        )
      );

  await db.insert(documentVersions).values({
    ownerType: 'dg_circuit_document',
    ownerId: circuitDoc.id,
    fileUrl: newFileUrl,
    mimeType,
    uploadedBy: actorUserId,
    isCurrent: true,
  });

  await linkUploadAssetToOwner({
    uploadAssetId,
    ownerType: 'dg_circuit_document',
    ownerId: circuitDoc.id,
    expectedFileUrl: newFileUrl,
  });

  await logAudit({
    userId: actorUserId,
    action: 'DG_CIRCUIT_DOCUMENT_REPLACED',
    module: 'M1',
    entityId: requestId,
  });
}
