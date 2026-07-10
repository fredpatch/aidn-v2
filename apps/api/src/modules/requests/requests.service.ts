import { eq, desc } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import {
  requests,
  dgCircuitDocuments,
  documentVersions,
  applicants,
  organisations,
} from "../../shared/db/schema.js";
import { logAudit } from "../auth/auth.service.js";
import { generateRequestReference } from "./requests.helpers.js";
import type { SubmitRequestParams, RequestView } from "./requests.types.js";
import { linkUploadAssetToOwner } from "../uploads/uploads.service.js";

export type { SubmitRequestParams, RequestView } from "./requests.types.js";

/** Postgres unique_violation. Thrown by the partial unique index on
 *  requests.organisationId (pattern "one active request per organisation")
 *  or the one on dg_circuit_documents(entityType, requestId).
 *  Drizzle wraps the underlying pg error in a DrizzleQueryError, so the
 *  Postgres error code lives on `error.cause.code`, not `error.code`. */
function isUniqueViolation(error: unknown): boolean {
  const pgCode = (error as { code?: string })?.code;
  const causeCode = (error as { cause?: { code?: string } })?.cause?.code;
  return pgCode === "23505" || causeCode === "23505";
}

function toRequestView(
  row: typeof requests.$inferSelect,
  circuitStatus: string | null
): RequestView {
  return {
    id: row.id,
    reference: row.reference,
    applicantId: row.applicantId,
    organisationId: row.organisationId,
    requestType: row.requestType,
    message: row.message,
    status: row.status,
    rejectionReason: row.rejectionReason,
    circuitStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** M1 - submits a new demande. Works identically whether it came through the
 *  portal or was entered manually by reception/assistant_dg for a physical
 *  drop-off - see cross-cutting pattern "Circuit DG". */
export async function submitRequest(params: SubmitRequestParams): Promise<RequestView> {
  const [applicant] = await db.select().from(applicants).where(eq(applicants.id, params.applicantId));
  if (!applicant) throw new Error("APPLICANT_NOT_FOUND");

  const [organisation] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, applicant.organisationId));
  if (!organisation) throw new Error("APPLICANT_NOT_FOUND");

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
        status: "submitted",
      })
      .returning();

    const [circuitDoc] = await db
      .insert(dgCircuitDocuments)
      .values({
        entityType: "intake_request",
        requestId: request.id,
        status: "submitted",
      })
      .returning();

    await db.insert(documentVersions).values({
      ownerType: "dg_circuit_document",
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
      action: "REQUEST_SUBMITTED",
      module: "M1",
      entityId: request.id,
      details: { reference, requestType: params.requestType },
    });

    return toRequestView(request, circuitDoc.status);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("REQUEST_ALREADY_ACTIVE");
    }
    throw error;
  }
}

export async function getRequest(requestId: number): Promise<RequestView> {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error("REQUEST_NOT_FOUND");

  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));

  return toRequestView(request, circuitDoc?.status ?? null);
}

export async function listRequests(filters: { status?: string }): Promise<RequestView[]> {
  const rows = filters.status
    ? await db.select().from(requests).where(eq(requests.status, filters.status as typeof requests.$inferSelect.status)).orderBy(desc(requests.createdAt))
    : await db.select().from(requests).orderBy(desc(requests.createdAt));

  const withCircuit = await Promise.all(
    rows.map(async (row) => {
      const [circuitDoc] = await db
        .select()
        .from(dgCircuitDocuments)
        .where(eq(dgCircuitDocuments.requestId, row.id));
      return toRequestView(row, circuitDoc?.status ?? null);
    })
  );

  return withCircuit;
}

/** Pattern "Circuit DG" - Depose -> Signe. Triggered manually by whoever
 *  re-scans the DG-signed document back into the app. */
export async function markSigned(requestId: number, actorUserId: number): Promise<RequestView> {
  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));
  if (!circuitDoc) throw new Error("DG_CIRCUIT_NOT_FOUND");
  if (circuitDoc.status !== "submitted") throw new Error("INVALID_CIRCUIT_TRANSITION");

  await db
    .update(dgCircuitDocuments)
    .set({ status: "signed", signedAt: new Date() })
    .where(eq(dgCircuitDocuments.id, circuitDoc.id));

  const [request] = await db
    .update(requests)
    .set({ status: "signed", updatedAt: new Date() })
    .where(eq(requests.id, requestId))
    .returning();

  await logAudit({ userId: actorUserId, action: "DG_CIRCUIT_SIGNED", module: "M1", entityId: requestId });

  return toRequestView(request, "signed");
}

/** Pattern "Circuit DG" - Signe -> En attente de traitement. DN can now
 *  start working the dossier (Phase 1 creation is a separate module). */
export async function markPendingReview(requestId: number, actorUserId: number): Promise<RequestView> {
  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));
  if (!circuitDoc) throw new Error("DG_CIRCUIT_NOT_FOUND");
  if (circuitDoc.status !== "signed") throw new Error("INVALID_CIRCUIT_TRANSITION");

  await db
    .update(dgCircuitDocuments)
    .set({ status: "pending_review", pendingReviewAt: new Date() })
    .where(eq(dgCircuitDocuments.id, circuitDoc.id));

  const [request] = await db
    .update(requests)
    .set({ status: "pending_review", updatedAt: new Date() })
    .where(eq(requests.id, requestId))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: "DG_CIRCUIT_PENDING_REVIEW",
    module: "M1",
    entityId: requestId,
  });

  return toRequestView(request, "pending_review");
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
  if (!request) throw new Error("REQUEST_NOT_FOUND");

  if (actor.applicantId !== undefined && request.applicantId !== actor.applicantId) {
    throw new Error("REQUEST_NOT_FOUND"); // don't leak existence of someone else's request
  }

  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));
  if (!circuitDoc) throw new Error("DG_CIRCUIT_NOT_FOUND");
  if (circuitDoc.status !== "submitted") throw new Error("REQUEST_NOT_CANCELLABLE");

  const [updated] = await db
    .update(requests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(requests.id, requestId))
    .returning();

  await logAudit({
    userId: actor.userId,
    action: "REQUEST_CANCELLED",
    module: "M1",
    entityId: requestId,
    details: actor.applicantId ? { cancelledByApplicant: actor.applicantId } : undefined,
  });

  return toRequestView(updated, circuitDoc.status);
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
      return toRequestView(row, circuitDoc?.status ?? null);
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
  if (!circuitDoc) throw new Error("DG_CIRCUIT_NOT_FOUND");

  await db
    .update(documentVersions)
    .set({ isCurrent: false, trashedAt: new Date() })
    .where(eq(documentVersions.ownerId, circuitDoc.id));

  await db.insert(documentVersions).values({
    ownerType: "dg_circuit_document",
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
    action: "DG_CIRCUIT_DOCUMENT_REPLACED",
    module: "M1",
    entityId: requestId,
  });
}
