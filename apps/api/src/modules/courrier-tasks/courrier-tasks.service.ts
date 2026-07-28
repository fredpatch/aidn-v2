import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import {
  applicants,
  dgCircuitDocuments,
  documentVersions,
  organisations,
  phases,
  requests,
} from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { linkUploadAssetToOwner } from '../uploads/uploads.service.js';
import type {
  CourrierTaskBucket,
  CourrierTaskListResponse,
  CourrierTaskSource,
  CourrierTaskView,
} from './courrier-tasks.types.js';

const MANAGED_ENTITY_TYPES: CourrierTaskSource[] = ['intake_request', 'formal_request_letter'];

function parseTaskId(taskId: string): { source: CourrierTaskSource; requestId: number } {
  const [source, rawRequestId] = taskId.split(':');
  const requestId = Number(rawRequestId);

  if (
    !MANAGED_ENTITY_TYPES.includes(source as CourrierTaskSource) ||
    !Number.isInteger(requestId)
  ) {
    throw new Error('COURRIER_TASK_INVALID');
  }

  return { source: source as CourrierTaskSource, requestId };
}

function bucketForStatus(status: string): CourrierTaskBucket {
  if (status === 'submitted') return 'to_signature';
  if (status === 'in_signature_circuit') return 'in_signature';
  if (status === 'pending_review') return 'returned';
  if (status === 'signed') return 'legacy_signed';
  return 'to_signature';
}

function actionsForStatus(status: string): CourrierTaskView['availableActions'] {
  if (status === 'submitted') return ['print', 'confirm_signature_circuit'];
  if (status === 'in_signature_circuit') return ['upload_signed_return'];
  return [];
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

async function buildTaskView(
  row: typeof dgCircuitDocuments.$inferSelect
): Promise<CourrierTaskView | null> {
  const [request] = await db.select().from(requests).where(eq(requests.id, row.requestId));
  if (!request) return null;

  const [organisation] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, request.organisationId));
  const [applicant] = await db
    .select()
    .from(applicants)
    .where(eq(applicants.id, request.applicantId));
  const currentDocument = await getCurrentCircuitDocument(row.id);

  return {
    id: `${row.entityType}:${row.requestId}`,
    source: row.entityType as CourrierTaskSource,
    bucket: bucketForStatus(row.status),
    requestId: row.requestId,
    requestReference: request.reference,
    requestType: request.requestType,
    organisationName: organisation?.name ?? '-',
    applicantName: applicant?.fullName ?? '-',
    circuitDocumentId: row.id,
    circuitStatus: row.status,
    fileUrl: currentDocument?.fileUrl ?? null,
    mimeType: currentDocument?.mimeType ?? null,
    depositedAt: row.depositedAt,
    signatureSentAt: row.signatureSentAt,
    signedAt: row.signedAt,
    pendingReviewAt: row.pendingReviewAt,
    availableActions: actionsForStatus(row.status),
  };
}

async function getCircuitForTask(taskId: string) {
  const { source, requestId } = parseTaskId(taskId);
  const [circuit] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(
      and(eq(dgCircuitDocuments.entityType, source), eq(dgCircuitDocuments.requestId, requestId))
    );
  if (!circuit) throw new Error('COURRIER_TASK_NOT_FOUND');
  return circuit;
}

async function ensureTaskCanMutate(circuit: typeof dgCircuitDocuments.$inferSelect): Promise<void> {
  if (circuit.entityType !== 'formal_request_letter') return;

  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, circuit.requestId), eq(phases.phaseCode, 'M4')));
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  if (phase.status !== 'open') throw new Error('PHASE_NOT_OPEN');
}

export async function listCourrierTasks(filters: {
  bucket?: string;
  source?: string;
}): Promise<CourrierTaskListResponse> {
  const rows =
    filters.source && MANAGED_ENTITY_TYPES.includes(filters.source as CourrierTaskSource)
      ? await db
          .select()
          .from(dgCircuitDocuments)
          .where(eq(dgCircuitDocuments.entityType, filters.source as CourrierTaskSource))
          .orderBy(desc(dgCircuitDocuments.depositedAt))
      : await db.select().from(dgCircuitDocuments).orderBy(desc(dgCircuitDocuments.depositedAt));

  const tasks = (
    await Promise.all(
      rows
        .filter((row) => MANAGED_ENTITY_TYPES.includes(row.entityType as CourrierTaskSource))
        .map(buildTaskView)
    )
  ).filter((task): task is CourrierTaskView => !!task);

  const filtered = filters.bucket ? tasks.filter((task) => task.bucket === filters.bucket) : tasks;

  return {
    items: filtered,
    counts: {
      toSignature: tasks.filter((task) => task.bucket === 'to_signature').length,
      inSignature: tasks.filter((task) => task.bucket === 'in_signature').length,
      returned: tasks.filter((task) => task.bucket === 'returned').length,
      legacySigned: tasks.filter((task) => task.bucket === 'legacy_signed').length,
    },
  };
}

export async function confirmPrintedForSignature(
  taskId: string,
  actorUserId: number
): Promise<CourrierTaskView> {
  const circuit = await getCircuitForTask(taskId);
  await ensureTaskCanMutate(circuit);
  if (circuit.status !== 'submitted') throw new Error('INVALID_CIRCUIT_TRANSITION');

  const [updated] = await db
    .update(dgCircuitDocuments)
    .set({ status: 'in_signature_circuit', signatureSentAt: new Date() })
    .where(eq(dgCircuitDocuments.id, circuit.id))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'COURRIER_SENT_TO_SIGNATURE',
    module: updated.entityType === 'formal_request_letter' ? 'M4' : 'M1',
    entityId: updated.id,
    details: { requestId: updated.requestId, entityType: updated.entityType },
  });

  const task = await buildTaskView(updated);
  if (!task) throw new Error('COURRIER_TASK_NOT_FOUND');
  return task;
}

export async function returnSigned(
  taskId: string,
  newFileUrl: string,
  mimeType: string,
  actorUserId: number,
  uploadAssetId?: number
): Promise<CourrierTaskView> {
  const circuit = await getCircuitForTask(taskId);
  await ensureTaskCanMutate(circuit);
  if (circuit.status !== 'in_signature_circuit') throw new Error('INVALID_CIRCUIT_TRANSITION');

  await db
    .update(documentVersions)
    .set({ isCurrent: false, trashedAt: new Date() })
    .where(
      and(
        eq(documentVersions.ownerType, 'dg_circuit_document'),
        eq(documentVersions.ownerId, circuit.id)
      )
    );

  await db.insert(documentVersions).values({
    ownerType: 'dg_circuit_document',
    ownerId: circuit.id,
    fileUrl: newFileUrl,
    mimeType,
    uploadedBy: actorUserId,
    isCurrent: true,
  });

  await linkUploadAssetToOwner({
    uploadAssetId,
    ownerType: 'dg_circuit_document',
    ownerId: circuit.id,
    expectedFileUrl: newFileUrl,
  });

  const now = new Date();
  const [updated] = await db
    .update(dgCircuitDocuments)
    .set({ status: 'pending_review', signedAt: now, pendingReviewAt: now })
    .where(eq(dgCircuitDocuments.id, circuit.id))
    .returning();

  if (updated.entityType === 'intake_request') {
    await db
      .update(requests)
      .set({ status: 'pending_review', updatedAt: now })
      .where(eq(requests.id, updated.requestId));
  }

  await logAudit({
    userId: actorUserId,
    action: 'COURRIER_SIGNED_RETURNED',
    module: updated.entityType === 'formal_request_letter' ? 'M4' : 'M1',
    entityId: updated.id,
    details: { requestId: updated.requestId, entityType: updated.entityType },
  });

  const task = await buildTaskView(updated);
  if (!task) throw new Error('COURRIER_TASK_NOT_FOUND');
  return task;
}
