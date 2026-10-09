import { and, desc, eq, inArray } from 'drizzle-orm';
import { subtractWorkingDays, workingDaysBetween, type PublicHolidays } from '@aidn/shared';
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
import {
  claimUploadAsset,
  linkLockedAsset,
  trashCurrentVersions,
  versionValues,
  type PreparedAttachment,
} from '../uploads/upload-attachment.js';
import { relocateDossierAssetAfterCommit, type RelocationTarget } from '../files/relocate-asset.js';
import type {
  CourrierTaskBucket,
  CourrierTaskListResponse,
  CourrierTaskSource,
  CourrierTaskView,
} from './courrier-tasks.types.js';
import { assertDossierOpen, dossierFlags } from '../requests/dossier-open.js';
import {
  getIntegerValue,
  getPublicHolidays,
} from '../system-parameters/system-parameters.service.js';

/** Same key and default as the Circuit DG alert job (jobs/dg-circuit-alert.job.ts). */
const DG_CIRCUIT_ALERT_DAYS_KEY = 'dg_circuit_alert_days';
const DG_CIRCUIT_ALERT_DAYS_DEFAULT = 3;

const MANAGED_ENTITY_TYPES: CourrierTaskSource[] = [
  'intake_request',
  'formal_request_letter',
  'pre_evaluation',
];

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

function moduleForEntityType(entityType: string): string {
  if (entityType === 'formal_request_letter') return 'M4';
  if (entityType === 'pre_evaluation') return 'M3';
  return 'M1';
}

/** Phase whose open status gates the circuit actions (ensureTaskCanMutate);
 *  intake requests (M1) have none. */
function phaseCodeFor(entityType: string): 'M3' | 'M4' | null {
  if (entityType === 'formal_request_letter') return 'M4';
  if (entityType === 'pre_evaluation') return 'M3';
  return null;
}

/** C2c - read once per list (or per mutation), never per row. */
interface TaskContext {
  now: Date;
  alertDays: number;
  holidays: PublicHolidays;
  /** `${requestId}:${phaseCode}` of every open phase among the listed requests. */
  openPhases: Set<string>;
}

async function loadTaskContext(requestIds: number[]): Promise<TaskContext> {
  const [alertDays, holidays, openRows] = await Promise.all([
    getIntegerValue(DG_CIRCUIT_ALERT_DAYS_KEY, DG_CIRCUIT_ALERT_DAYS_DEFAULT),
    getPublicHolidays(),
    requestIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ requestId: phases.requestId, phaseCode: phases.phaseCode })
          .from(phases)
          .where(
            and(
              inArray(phases.requestId, requestIds),
              inArray(phases.phaseCode, ['M3', 'M4']),
              eq(phases.status, 'open')
            )
          ),
  ]);
  return {
    now: new Date(),
    alertDays,
    holidays,
    openPhases: new Set(openRows.map((row) => `${row.requestId}:${row.phaseCode}`)),
  };
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
  row: typeof dgCircuitDocuments.$inferSelect,
  ctx: TaskContext
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
  // K7c - closed dossier: no print, no signature circuit, no return; the
  // document stays viewable (fileUrl).
  const flags = dossierFlags(request.status);
  // C2c - same guard as ensureTaskCanMutate: a pending courrier of an M3 / M4
  // phase that is not open offers no action (the API would refuse it).
  const statusActions = actionsForStatus(row.status);
  const phaseCode = phaseCodeFor(row.entityType);
  const phaseBlocked =
    !flags.dossierClosed &&
    statusActions.length > 0 &&
    phaseCode !== null &&
    !ctx.openPhases.has(`${row.requestId}:${phaseCode}`);
  const inSignature = row.status === 'in_signature_circuit' && row.signatureSentAt !== null;

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
    availableActions: flags.dossierClosed || phaseBlocked ? [] : statusActions,
    ...flags,
    actionBlockedReason: phaseBlocked ? 'phase_not_open' : null,
    signatureWorkingDays: inSignature
      ? Math.floor(workingDaysBetween(row.signatureSentAt!, ctx.now, ctx.holidays))
      : null,
    // Exactly the alert job's cutoff: sent before it = more than N working days.
    signatureLate:
      inSignature &&
      row.signatureSentAt! < subtractWorkingDays(ctx.now, ctx.alertDays, ctx.holidays),
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
  // K7 - closed dossier: read-only (requests/dossier-open.ts), every circuit type.
  await assertDossierOpen(db, circuit.requestId);
  const phaseCode = phaseCodeFor(circuit.entityType);
  if (!phaseCode) return;

  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, circuit.requestId), eq(phases.phaseCode, phaseCode)));
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  if (phase.status !== 'open') throw new Error('PHASE_NOT_OPEN');
}

/** K7d - a courrier still to print or in signature on a closed dossier needs
 *  no action: it leaves those buckets and their counts (bucket itself keeps
 *  the circuit status; the full list still returns it). */
const ACTION_BUCKETS: readonly string[] = ['to_signature', 'in_signature'];

function inBucket(task: CourrierTaskView, bucket: string): boolean {
  if (task.bucket !== bucket) return false;
  return !(task.dossierClosed && ACTION_BUCKETS.includes(bucket));
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

  const managed = rows.filter((row) =>
    MANAGED_ENTITY_TYPES.includes(row.entityType as CourrierTaskSource)
  );
  const ctx = await loadTaskContext([...new Set(managed.map((row) => row.requestId))]);
  const tasks = (await Promise.all(managed.map((row) => buildTaskView(row, ctx)))).filter(
    (task): task is CourrierTaskView => !!task
  );

  const filtered = filters.bucket ? tasks.filter((task) => inBucket(task, filters.bucket!)) : tasks;

  return {
    items: filtered,
    counts: {
      toSignature: tasks.filter((task) => inBucket(task, 'to_signature')).length,
      inSignature: tasks.filter((task) => inBucket(task, 'in_signature')).length,
      returned: tasks.filter((task) => inBucket(task, 'returned')).length,
      legacySigned: tasks.filter((task) => inBucket(task, 'legacy_signed')).length,
    },
    signatureAlertDays: ctx.alertDays,
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
    module: moduleForEntityType(updated.entityType),
    entityId: updated.id,
    details: { requestId: updated.requestId, entityType: updated.entityType },
  });

  const task = await buildTaskView(updated, await loadTaskContext([updated.requestId]));
  if (!task) throw new Error('COURRIER_TASK_NOT_FOUND');
  return task;
}

export async function returnSigned(
  taskId: string,
  attachment: PreparedAttachment,
  actorUserId: number
): Promise<CourrierTaskView> {
  const found = await getCircuitForTask(taskId);
  await ensureTaskCanMutate(found);

  const target: RelocationTarget = { ownerType: 'dg_circuit_document', ownerId: found.id };
  const updated = await db.transaction(async (tx) => {
    // STORAGE-0B - target row locked first, then the upload asset.
    const [circuit] = await tx
      .select()
      .from(dgCircuitDocuments)
      .where(eq(dgCircuitDocuments.id, found.id))
      .for('update');
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') return circuit;
    if (circuit.status !== 'in_signature_circuit') throw new Error('INVALID_CIRCUIT_TRANSITION');

    await trashCurrentVersions(tx, 'dg_circuit_document', circuit.id);
    await tx
      .insert(documentVersions)
      .values(versionValues(attachment, 'dg_circuit_document', circuit.id));
    await linkLockedAsset(tx, attachment.assetId, target);

    const now = new Date();
    const [signed] = await tx
      .update(dgCircuitDocuments)
      .set({ status: 'pending_review', signedAt: now, pendingReviewAt: now })
      .where(eq(dgCircuitDocuments.id, circuit.id))
      .returning();

    if (signed.entityType === 'intake_request') {
      await tx
        .update(requests)
        .set({ status: 'pending_review', updatedAt: now })
        .where(eq(requests.id, signed.requestId));
    }

    await logAudit(
      {
        userId: actorUserId,
        action: 'COURRIER_SIGNED_RETURNED',
        module: moduleForEntityType(signed.entityType),
        entityId: signed.id,
        details: { requestId: signed.requestId, entityType: signed.entityType },
      },
      tx
    );
    return signed;
  });

  await relocateDossierAssetAfterCommit(attachment.assetId, target);

  const task = await buildTaskView(updated, await loadTaskContext([updated.requestId]));
  if (!task) throw new Error('COURRIER_TASK_NOT_FOUND');
  return task;
}
