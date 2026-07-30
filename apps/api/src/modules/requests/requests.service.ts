import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import {
  auditLogs,
  requests,
  dgCircuitDocuments,
  documentEvaluations,
  documentVersions,
  formalRequestDocuments,
  applicants,
  organisations,
  phases,
  users,
} from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { generateRequestReference } from './requests.helpers.js';
import type {
  RequestCockpitActivity,
  RequestCockpitItem,
  RequestCockpitPhase,
  RequestCockpitSummary,
  SubmitRequestParams,
  RequestView,
} from './requests.types.js';
import { linkUploadAssetToOwner } from '../uploads/uploads.service.js';

export type { SubmitRequestParams, RequestView } from './requests.types.js';

const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: 'Reconnaissance',
  issuance: 'Delivrance',
  modification: 'Modification',
  renewal: 'Renouvellement',
};

const REQUEST_STATUS_LABELS: Record<string, string> = {
  submitted: 'Depose',
  signed: 'Signe',
  pending_review: 'En attente de traitement',
  in_progress: 'En cours',
  rejected: 'Rejete',
  completed: 'Termine',
  cancelled: 'Annule',
};

const CIRCUIT_STATUS_LABELS: Record<string, string> = {
  submitted: 'Depose',
  in_signature_circuit: 'En signature',
  signed: 'Signe',
  pending_review: 'Circuit termine',
  completed: 'Circuit termine',
};

const PHASE_LABELS: Record<string, string> = {
  M3: 'Preliminaire',
  M4: 'Demande formelle',
  M5: 'Evaluation approfondie',
  M6: 'Demonstration / Inspection',
  M7: 'Delivrance',
};

const PHASE_CODES = ['M3', 'M4', 'M5', 'M6', 'M7'] as const;
const TERMINAL_REQUEST_STATUSES = ['rejected', 'completed', 'cancelled'];

function phaseHref(phaseCode: string, requestId: number): string {
  if (phaseCode === 'M3') return `/demandes/${requestId}/phase-preliminaire`;
  if (phaseCode === 'M4') return `/demandes/${requestId}/phase-formelle`;
  if (phaseCode === 'M5') return `/demandes/${requestId}/evaluation-approfondie`;
  if (phaseCode === 'M6') return `/demandes/${requestId}/demonstration-inspection`;
  return `/demandes/${requestId}/delivrance`;
}

function activityLabel(action: string): { title: string; tone: RequestCockpitActivity['tone'] } {
  if (action === 'REQUEST_SUBMITTED') return { title: 'Demande deposee', tone: 'info' };
  if (action === 'DG_CIRCUIT_SENT_TO_SIGNATURE') {
    return { title: 'Demande mise en signature', tone: 'warning' };
  }
  if (action === 'DG_CIRCUIT_SIGNED_RETURNED') {
    return { title: 'Retour signe scanne', tone: 'success' };
  }
  if (action === 'DG_CIRCUIT_PENDING_REVIEW') {
    return { title: 'Demande transmise a la DN', tone: 'success' };
  }
  if (action === 'REQUEST_CANCELLED') return { title: 'Demande annulee', tone: 'danger' };
  return { title: action.replaceAll('_', ' ').toLowerCase(), tone: 'info' };
}

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

export async function listRequestCockpit(): Promise<RequestCockpitSummary> {
  const [
    requestRows,
    phaseRows,
    circuitRows,
    formalDocumentRows,
    evaluationRows,
    activityRows,
  ] = await Promise.all([
    db
      .select({
        request: requests,
        organisation: organisations,
        applicant: applicants,
      })
      .from(requests)
      .innerJoin(organisations, eq(requests.organisationId, organisations.id))
      .innerJoin(applicants, eq(requests.applicantId, applicants.id))
      .orderBy(desc(requests.createdAt)),
    db.select().from(phases),
    db.select().from(dgCircuitDocuments),
    db.select().from(formalRequestDocuments),
    db.select().from(documentEvaluations),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        module: auditLogs.module,
        entityId: auditLogs.entityId,
        createdAt: auditLogs.createdAt,
        actor: users.fullName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(120),
  ]);

  const phaseRowsByRequestId = new Map<number, Array<typeof phases.$inferSelect>>();
  for (const phase of phaseRows) {
    const list = phaseRowsByRequestId.get(phase.requestId) ?? [];
    list.push(phase);
    phaseRowsByRequestId.set(phase.requestId, list);
  }

  const circuitByRequestId = new Map(circuitRows.map((row) => [row.requestId, row]));
  const formalDocsByPhaseId = new Map<number, Array<typeof formalRequestDocuments.$inferSelect>>();
  for (const document of formalDocumentRows) {
    const list = formalDocsByPhaseId.get(document.phaseId) ?? [];
    list.push(document);
    formalDocsByPhaseId.set(document.phaseId, list);
  }
  const evaluationsByDocumentId = new Map(evaluationRows.map((row) => [row.formalRequestDocumentId, row]));
  const activitiesByRequestId = new Map<number, RequestCockpitActivity[]>();
  for (const activity of activityRows) {
    if (!activity.entityId || activity.module !== 'M1') continue;
    const label = activityLabel(activity.action);
    const list = activitiesByRequestId.get(activity.entityId) ?? [];
    if (list.length >= 3) continue;
    list.push({
      id: activity.id,
      title: label.title,
      actor: activity.actor ?? 'Systeme',
      createdAt: activity.createdAt.toISOString(),
      tone: label.tone,
    });
    activitiesByRequestId.set(activity.entityId, list);
  }

  function phasesForRequest(requestId: number): RequestCockpitPhase[] {
    const rows = phaseRowsByRequestId.get(requestId) ?? [];
    const byCode = new Map(rows.map((row) => [row.phaseCode, row]));
    return PHASE_CODES.map((phaseCode) => {
      const row = byCode.get(phaseCode);
      return {
        phaseCode,
        label: PHASE_LABELS[phaseCode],
        status: row ? (row.status === 'closed' ? 'closed' : 'open') : 'not_started',
        href: phaseHref(phaseCode, requestId),
      };
    });
  }

  function currentPhaseLabel(phasesSummary: RequestCockpitPhase[]): {
    currentPhaseCode: string | null;
    currentPhaseLabel: string;
  } {
    const openPhase = [...phasesSummary].reverse().find((phase) => phase.status === 'open');
    if (openPhase) {
      return { currentPhaseCode: openPhase.phaseCode, currentPhaseLabel: openPhase.label };
    }
    const closedPhase = [...phasesSummary].reverse().find((phase) => phase.status === 'closed');
    if (closedPhase) {
      return { currentPhaseCode: closedPhase.phaseCode, currentPhaseLabel: closedPhase.label };
    }
    return { currentPhaseCode: null, currentPhaseLabel: 'Circuit signature' };
  }

  function documentSummary(requestId: number) {
    const requestPhases = phaseRowsByRequestId.get(requestId) ?? [];
    const formalPhase = requestPhases.find((phase) => phase.phaseCode === 'M4');
    if (!formalPhase) return { completed: 0, missing: 0, pending: 0, total: 0 };
    const documents = formalDocsByPhaseId.get(formalPhase.id) ?? [];
    const submittedDocs = documents.filter((document) => document.status === 'submitted');
    const completed = submittedDocs.length;
    const pending = submittedDocs.filter((document) => {
      const evaluation = evaluationsByDocumentId.get(document.id);
      return !evaluation || !evaluation.verdict;
    }).length;
    return {
      completed,
      missing: Math.max(11 - completed, 0),
      pending,
      total: 11,
    };
  }

  function nextAction(params: {
    requestId: number;
    status: string;
    circuitStatus: string | null;
    phasesSummary: RequestCockpitPhase[];
  }): Pick<
    RequestCockpitItem,
    | 'nextActionLabel'
    | 'nextActionDescription'
    | 'nextActionHref'
    | 'nextActionTone'
    | 'canStartPreliminary'
  > {
    const { requestId, status, circuitStatus, phasesSummary } = params;
    if (status === 'completed') {
      return {
        nextActionLabel: 'Workflow termine',
        nextActionDescription: 'Le dossier est cloture. Les phases restent disponibles pour audit.',
        nextActionHref: phaseHref('M7', requestId),
        nextActionTone: 'success',
        canStartPreliminary: false,
      };
    }
    if (status === 'rejected' || status === 'cancelled') {
      return {
        nextActionLabel: status === 'rejected' ? 'Dossier rejete' : 'Dossier annule',
        nextActionDescription: 'Aucune action DN immediate sur ce dossier.',
        nextActionHref: null,
        nextActionTone: 'danger',
        canStartPreliminary: false,
      };
    }
    if (circuitStatus === 'submitted') {
      return {
        nextActionLabel: 'Reception doit mettre en signature',
        nextActionDescription: 'Le dossier attend impression et mise en circuit signature.',
        nextActionHref: null,
        nextActionTone: 'warning',
        canStartPreliminary: false,
      };
    }
    if (circuitStatus === 'in_signature_circuit') {
      return {
        nextActionLabel: 'Retour signe attendu',
        nextActionDescription: 'La DN suit le dossier en lecture seule jusqu au scan retour.',
        nextActionHref: null,
        nextActionTone: 'warning',
        canStartPreliminary: false,
      };
    }
    if (status === 'pending_review' && circuitStatus === 'pending_review') {
      return {
        nextActionLabel: 'Ouvrir la phase preliminaire',
        nextActionDescription: 'Le retour signe est transmis. DN peut demarrer le traitement.',
        nextActionHref: phaseHref('M3', requestId),
        nextActionTone: 'info',
        canStartPreliminary: true,
      };
    }
    const openPhase = phasesSummary.find((phase) => phase.status === 'open');
    if (openPhase) {
      return {
        nextActionLabel: `Poursuivre ${openPhase.label}`,
        nextActionDescription: 'Continuer le traitement depuis la phase ouverte.',
        nextActionHref: openPhase.href,
        nextActionTone: 'info',
        canStartPreliminary: false,
      };
    }
    const lastClosed = [...phasesSummary].reverse().find((phase) => phase.status === 'closed');
    if (lastClosed) {
      return {
        nextActionLabel: 'Ouvrir la phase suivante',
        nextActionDescription: 'La derniere phase est cloturee. DN peut poursuivre le circuit.',
        nextActionHref: lastClosed.href,
        nextActionTone: 'info',
        canStartPreliminary: false,
      };
    }
    return {
      nextActionLabel: 'A verifier',
      nextActionDescription: 'Le dossier ne correspond pas encore a une action DN standard.',
      nextActionHref: null,
      nextActionTone: 'warning',
      canStartPreliminary: false,
    };
  }

  const items: RequestCockpitItem[] = await Promise.all(
    requestRows.map(async (row) => {
      const resolvedStatus = await resolveRequestStatus(row.request);
      const phasesSummary = phasesForRequest(row.request.id);
      const currentPhase = currentPhaseLabel(phasesSummary);
      const circuit = circuitByRequestId.get(row.request.id) ?? null;
      const action = nextAction({
        requestId: row.request.id,
        status: resolvedStatus,
        circuitStatus: circuit?.status ?? null,
        phasesSummary,
      });
      return {
        id: row.request.id,
        reference: row.request.reference,
        requestType: row.request.requestType,
        requestTypeLabel: REQUEST_TYPE_LABELS[row.request.requestType] ?? row.request.requestType,
        status: resolvedStatus,
        statusLabel: REQUEST_STATUS_LABELS[resolvedStatus] ?? resolvedStatus,
        circuitStatus: circuit?.status ?? null,
        circuitStatusLabel: circuit
          ? CIRCUIT_STATUS_LABELS[circuit.status] ?? circuit.status
          : 'Non initialise',
        createdAt: row.request.createdAt.toISOString(),
        updatedAt: row.request.updatedAt.toISOString(),
        organisationName: row.organisation.name,
        organisationEmail: row.organisation.email,
        organisationPhone: row.organisation.phone,
        applicantName: row.applicant.fullName,
        applicantEmail: row.applicant.email,
        applicantPhone: row.applicant.phone,
        ...currentPhase,
        phases: phasesSummary,
        documentSummary: documentSummary(row.request.id),
        ...action,
        activity: activitiesByRequestId.get(row.request.id) ?? [],
      };
    })
  );

  const activeItems = items.filter((item) => !TERMINAL_REQUEST_STATUSES.includes(item.status));
  const waitingDg = items.filter((item) =>
    ['submitted', 'in_signature_circuit', 'signed'].includes(item.circuitStatus ?? '')
  );
  const inReview = items.filter((item) => item.status === 'in_progress' || item.status === 'pending_review');
  const completed = items.filter((item) => item.status === 'completed');

  return {
    metrics: [
      {
        key: 'new',
        label: 'Nouvelles',
        value: items.filter((item) => item.status === 'pending_review').length,
        helper: 'Retours signes prets a ouvrir',
        tone: 'info',
      },
      {
        key: 'in_review',
        label: "En cours d'examen",
        value: inReview.length,
        helper: 'Dossiers ouverts ou prets DN',
        tone: inReview.length > 0 ? 'warning' : 'success',
      },
      {
        key: 'waiting_dg',
        label: 'En attente DG',
        value: waitingDg.length,
        helper: 'Circuit signature non termine',
        tone: waitingDg.length > 0 ? 'warning' : 'success',
      },
      {
        key: 'closed',
        label: 'Cloturees',
        value: completed.length,
        helper: `${activeItems.length} dossier(s) non termines`,
        tone: 'success',
      },
    ],
    items,
    updatedAt: new Date().toISOString(),
  };
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
