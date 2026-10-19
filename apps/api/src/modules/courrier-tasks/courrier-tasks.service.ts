import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  COURRIER_BUCKETS,
  OPERATIONAL_OWNERS,
  countBuckets,
  subtractWorkingDays,
  urgencyFromAge,
  workingDaysBetween,
  type PublicHolidays,
} from '@aidn/shared';
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
  CourrierCircuitStep,
  CourrierQueueItem,
  CourrierQueueResponse,
  CourrierTaskSource,
  CourrierTaskView,
} from './courrier-tasks.types.js';
import { returnIntakeDgAnnotation } from '../dn-annotation/intake-dg-return.js';
import { assertDossierOpen, dossierFlags } from '../requests/dossier-open.js';
import { getPublicHolidays } from '../system-parameters/system-parameters.service.js';
import { loadThresholds } from '../operational/thresholds.js';
import { calendarDaysSince } from '../operational/aging.js';

/** The reception-family circuits (Courriers cockpit; ROLE-ANALYTICS-1C history). */
export const MANAGED_ENTITY_TYPES: readonly CourrierTaskSource[] = [
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
  thresholds: { dgAlertWorkingDays: number; depositDays: number };
  holidays: PublicHolidays;
  /** `${requestId}:${phaseCode}` of every open phase among the listed requests. */
  openPhases: Set<string>;
  /** C2d - loaded in batch (no query per row): request with its organisation
   *  and applicant names, and the current document of each circuit. */
  requestsById: Map<number, RequestRow>;
  documentsByCircuitId: Map<number, { fileUrl: string; mimeType: string }>;
}

interface RequestRow {
  reference: string;
  requestType: string;
  status: string;
  organisationName: string | null;
  applicantName: string | null;
}

async function loadTaskContext(
  rows: Array<typeof dgCircuitDocuments.$inferSelect>
): Promise<TaskContext> {
  const requestIds = [...new Set(rows.map((row) => row.requestId))];
  const circuitIds = rows.map((row) => row.id);
  const none = Promise.resolve([]);
  const [limits, holidays, openRows, requestRows, documentRows] = await Promise.all([
    loadThresholds(['dgAlertWorkingDays', 'signatureDepositDays']),
    getPublicHolidays(),
    requestIds.length === 0
      ? none
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
    requestIds.length === 0
      ? none
      : db
          .select({
            id: requests.id,
            reference: requests.reference,
            requestType: requests.requestType,
            status: requests.status,
            organisationName: organisations.name,
            applicantName: applicants.fullName,
          })
          .from(requests)
          .leftJoin(organisations, eq(organisations.id, requests.organisationId))
          .leftJoin(applicants, eq(applicants.id, requests.applicantId))
          .where(inArray(requests.id, requestIds)),
    circuitIds.length === 0
      ? none
      : db
          .select({
            ownerId: documentVersions.ownerId,
            fileUrl: documentVersions.fileUrl,
            mimeType: documentVersions.mimeType,
          })
          .from(documentVersions)
          .where(
            and(
              eq(documentVersions.ownerType, 'dg_circuit_document'),
              inArray(documentVersions.ownerId, circuitIds),
              eq(documentVersions.isCurrent, true)
            )
          ),
  ]);
  return {
    now: new Date(),
    thresholds: { dgAlertWorkingDays: limits.dgAlertWorkingDays, depositDays: limits.signatureDepositDays },
    holidays,
    openPhases: new Set(openRows.map((row) => `${row.requestId}:${row.phaseCode}`)),
    requestsById: new Map(requestRows.map((row) => [row.id, row])),
    documentsByCircuitId: new Map(
      documentRows.map((row) => [row.ownerId, { fileUrl: row.fileUrl, mimeType: row.mimeType }])
    ),
  };
}

function actionsForStatus(status: string): CourrierTaskView['availableActions'] {
  if (status === 'submitted') return ['print', 'confirm_signature_circuit'];
  if (status === 'in_signature_circuit') return ['upload_signed_return'];
  return [];
}

function circuitStepFor(status: string): CourrierCircuitStep {
  if (status === 'in_signature_circuit') return 'with_dg';
  if (status === 'pending_review') return 'returned';
  if (status === 'signed') return 'legacy_signed';
  return 'deposited';
}

function stepSinceOf(row: typeof dgCircuitDocuments.$inferSelect): Date {
  if (row.status === 'in_signature_circuit') return row.signatureSentAt ?? row.depositedAt;
  if (row.status === 'pending_review') return row.pendingReviewAt ?? row.signedAt ?? row.depositedAt;
  if (row.status === 'signed') return row.signedAt ?? row.pendingReviewAt ?? row.depositedAt;
  return row.depositedAt;
}

type Operational = Pick<CourrierQueueItem, 'bucket' | 'state' | 'owner' | 'actionKey' | 'blockReason' | 'urgency'>;

function buildTaskView(row: typeof dgCircuitDocuments.$inferSelect, ctx: TaskContext): CourrierQueueItem | null {
  const request = ctx.requestsById.get(row.requestId);
  if (!request) return null;
  const currentDocument = ctx.documentsByCircuitId.get(row.id);
  // K7c - closed dossier: no print, no signature circuit, no return; the
  // document stays viewable (fileUrl).
  const flags = dossierFlags(request.status);
  // C2c - same guard as ensureTaskCanMutate: a pending courrier of an M3 / M4
  // phase that is not open offers no action (the API would refuse it).
  const statusActions = actionsForStatus(row.status);
  const pending = statusActions.length > 0;
  const phaseCode = phaseCodeFor(row.entityType);
  const phaseBlocked = !flags.dossierClosed && pending && phaseCode !== null && !ctx.openPhases.has(`${row.requestId}:${phaseCode}`);
  const inSignature = row.status === 'in_signature_circuit' && row.signatureSentAt !== null;
  const signatureWorkingDays = inSignature ? Math.floor(workingDaysBetween(row.signatureSentAt!, ctx.now, ctx.holidays)) : null;
  // Exactly the alert job's cutoff: sent before it = more than N working days.
  const signatureLate =
    inSignature && row.signatureSentAt! < subtractWorkingDays(ctx.now, ctx.thresholds.dgAlertWorkingDays, ctx.holidays);

  const inactive = (state: Operational['state'], owner: Operational['owner'], blockReason: Operational['blockReason']): Operational => ({
    bucket: 'inactive', state, owner, actionKey: 'none', blockReason, urgency: 'normal',
  });
  let op: Operational;
  if (pending && flags.dossierClosed) op = inactive('done', null, 'dossier_closed');
  else if (phaseBlocked) op = inactive('blocked', OPERATIONAL_OWNERS.dn, 'phase_not_open');
  else if (row.status === 'submitted') {
    op = {
      bucket: 'to_print', state: 'action_required', owner: OPERATIONAL_OWNERS.reception, actionKey: 'print_for_dg', blockReason: null,
      urgency: urgencyFromAge(calendarDaysSince(row.depositedAt, ctx.now), ctx.thresholds.depositDays),
    };
  } else if (row.status === 'in_signature_circuit') {
    // Overdue is exactly the alert job's cutoff; the step before it is the warning.
    const byAge = urgencyFromAge(signatureWorkingDays, ctx.thresholds.dgAlertWorkingDays);
    op = {
      bucket: 'with_dg', state: 'waiting', owner: OPERATIONAL_OWNERS.assistantDg, actionKey: 'record_dg_annotation', blockReason: null,
      urgency: signatureLate ? 'overdue' : byAge === 'normal' ? 'normal' : 'warning',
    };
  } else if (row.status === 'pending_review') {
    op = {
      bucket: 'returned', state: 'done', owner: null, blockReason: null, urgency: 'normal',
      // B6 - since M1-1 an initial request goes to the Assistante DN (Circuit Directeur DN).
      actionKey: row.entityType === 'intake_request' ? 'handed_to_assistant_dn' : 'handed_to_dn',
    };
  } else op = inactive('done', null, null); // legacy `signed` or an unknown status: history

  return {
    id: `${row.entityType}:${row.requestId}`,
    requestId: row.requestId,
    requestReference: request.reference,
    organisationName: request.organisationName ?? '-',
    ...op,
    stepSince: stepSinceOf(row).toISOString(),
    dueAt: null,
    ...flags,
    source: row.entityType as CourrierTaskSource,
    requestType: request.requestType,
    applicantName: request.applicantName ?? '-',
    circuitDocumentId: row.id,
    circuitStatus: row.status,
    circuitStep: circuitStepFor(row.status),
    fileUrl: currentDocument?.fileUrl ?? null,
    mimeType: currentDocument?.mimeType ?? null,
    depositedAt: row.depositedAt,
    signatureSentAt: row.signatureSentAt,
    signedAt: row.signedAt,
    pendingReviewAt: row.pendingReviewAt,
    availableActions: flags.dossierClosed || phaseBlocked ? [] : statusActions,
    signatureWorkingDays,
    signatureLate,
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

export async function listCourrierTasks(filters: {
  bucket?: string;
  source?: string;
}): Promise<CourrierQueueResponse> {
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
  const ctx = await loadTaskContext(managed);
  const tasks = managed
    .map((row) => buildTaskView(row, ctx))
    .filter((task): task is CourrierQueueItem => !!task);

  const items = filters.bucket ? tasks.filter((task) => task.bucket === filters.bucket) : tasks;
  return {
    items,
    counts: countBuckets(COURRIER_BUCKETS, tasks),
    thresholds: ctx.thresholds,
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

  const task = await buildTaskView(updated, await loadTaskContext([updated]));
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

  // SESSION1-M1-1 - the DG-annotated intake return has one implementation,
  // shared with requests.returnSignedFromDg: it creates the Directeur DN circuit
  // and no longer unlocks M3.
  if (found.entityType === 'intake_request') {
    const { circuit } = await returnIntakeDgAnnotation({
      requestId: found.requestId,
      attachment,
      actorUserId,
    });
    const intakeTask = await buildTaskView(circuit, await loadTaskContext([circuit]));
    if (!intakeTask) throw new Error('COURRIER_TASK_NOT_FOUND');
    return intakeTask;
  }

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

  const task = await buildTaskView(updated, await loadTaskContext([updated]));
  if (!task) throw new Error('COURRIER_TASK_NOT_FOUND');
  return task;
}
