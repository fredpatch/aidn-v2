import { and, desc, eq, inArray } from 'drizzle-orm';
import { DN_CIRCUIT_BUCKETS, OPERATIONAL_OWNERS, countBuckets, workingDaysBetween, type PublicHolidays } from '@aidn/shared';
import { db } from '../../shared/db/index.js';
import { applicants, dgCircuitDocuments, documentVersions, organisations, requests } from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import {
  claimUploadAsset,
  linkLockedAsset,
  trashCurrentVersions,
  versionValues,
  type PreparedAttachment,
} from '../uploads/upload-attachment.js';
import { relocateDossierAssetAfterCommit, type RelocationTarget } from '../files/relocate-asset.js';
import { assertDossierOpen, dossierFlags } from '../requests/dossier-open.js';
import { getPublicHolidays } from '../system-parameters/system-parameters.service.js';
import type {
  DnAnnotationAction,
  DnAnnotationTaskView,
  DnCircuitQueueItem,
  DnCircuitQueueResponse,
} from './dn-annotation.types.js';

type Circuit = typeof dgCircuitDocuments.$inferSelect;

const ENTITY_TYPE = 'dn_director_annotation' as const;

/** The only task id shape: `dn_director_annotation:<requestId>`. */
function parseTaskId(taskId: string): number {
  const [source, rawRequestId] = taskId.split(':');
  const requestId = Number(rawRequestId);
  if (source !== ENTITY_TYPE || !Number.isInteger(requestId)) throw new Error('DN_TASK_INVALID');
  return requestId;
}

type Operational = Pick<DnCircuitQueueItem, 'bucket' | 'state' | 'owner' | 'actionKey' | 'blockReason'>;

function operationalOf(status: string, dossierClosed: boolean): Operational {
  const pending = status === 'submitted' || status === 'in_signature_circuit';
  if (pending && dossierClosed) return { bucket: 'inactive', state: 'done', owner: null, actionKey: 'none', blockReason: 'dossier_closed' };
  if (status === 'submitted') return { bucket: 'to_send', state: 'action_required', owner: OPERATIONAL_OWNERS.assistantDn, actionKey: 'send_to_director', blockReason: null };
  if (status === 'in_signature_circuit') return { bucket: 'with_director', state: 'waiting', owner: OPERATIONAL_OWNERS.assistantDn, actionKey: 'record_director_annotation', blockReason: null };
  if (status === 'pending_review') return { bucket: 'returned', state: 'done', owner: null, actionKey: 'handed_to_dn', blockReason: null };
  return { bucket: 'inactive', state: 'done', owner: null, actionKey: 'none', blockReason: null };
}

function stepSinceOf(row: Circuit): Date {
  if (row.status === 'in_signature_circuit') return row.signatureSentAt ?? row.depositedAt;
  if (row.status === 'pending_review') return row.pendingReviewAt ?? row.depositedAt;
  return row.depositedAt;
}

function actionsFor(status: string): DnAnnotationAction[] {
  if (status === 'submitted') return ['send_to_director'];
  if (status === 'in_signature_circuit') return ['upload_annotated_return'];
  return [];
}

interface Context {
  holidays: PublicHolidays;
  now: Date;
  requestsById: Map<
    number,
    { reference: string; requestType: string; status: string; organisationName: string | null; applicantName: string | null }
  >;
  documentsByCircuitId: Map<number, { fileUrl: string; mimeType: string }>;
  versionCountByCircuitId: Map<number, number>;
}

async function loadContext(rows: Circuit[]): Promise<Context> {
  const requestIds = [...new Set(rows.map((row) => row.requestId))];
  const circuitIds = rows.map((row) => row.id);
  const [holidays, requestRows, versionRows] = await Promise.all([
    getPublicHolidays(),
    requestIds.length === 0
      ? Promise.resolve([])
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
      ? Promise.resolve([])
      : db
          .select({
            ownerId: documentVersions.ownerId,
            fileUrl: documentVersions.fileUrl,
            mimeType: documentVersions.mimeType,
            isCurrent: documentVersions.isCurrent,
          })
          .from(documentVersions)
          .where(and(eq(documentVersions.ownerType, 'dg_circuit_document'), inArray(documentVersions.ownerId, circuitIds))),
  ]);
  const documentsByCircuitId = new Map<number, { fileUrl: string; mimeType: string }>();
  const versionCountByCircuitId = new Map<number, number>();
  for (const row of versionRows) {
    versionCountByCircuitId.set(row.ownerId, (versionCountByCircuitId.get(row.ownerId) ?? 0) + 1);
    if (row.isCurrent) documentsByCircuitId.set(row.ownerId, { fileUrl: row.fileUrl, mimeType: row.mimeType });
  }
  return {
    holidays,
    now: new Date(),
    requestsById: new Map(requestRows.map((row) => [row.id, row])),
    documentsByCircuitId,
    versionCountByCircuitId,
  };
}

function buildView(row: Circuit, ctx: Context): DnCircuitQueueItem | null {
  const request = ctx.requestsById.get(row.requestId);
  if (!request) return null;
  const flags = dossierFlags(request.status);
  const document = ctx.documentsByCircuitId.get(row.id);
  const withDirector = row.status === 'in_signature_circuit' && row.signatureSentAt !== null;
  return {
    id: `${ENTITY_TYPE}:${row.requestId}`,
    requestId: row.requestId,
    requestReference: request.reference,
    organisationName: request.organisationName ?? '-',
    ...operationalOf(row.status, flags.dossierClosed),
    urgency: 'normal', // D10: Directeur DN aging is informational only
    stepSince: stepSinceOf(row).toISOString(),
    dueAt: null,
    requestType: request.requestType,
    applicantName: request.applicantName ?? '-',
    circuitDocumentId: row.id,
    fileUrl: document?.fileUrl ?? null,
    mimeType: document?.mimeType ?? null,
    createdAt: row.depositedAt,
    sentToDirectorAt: row.signatureSentAt,
    returnedAt: row.pendingReviewAt,
    // K7c - closed dossier: read-only, no action.
    availableActions: flags.dossierClosed ? [] : actionsFor(row.status),
    ...flags,
    directorWorkingDays: withDirector
      ? Math.floor(workingDaysBetween(row.signatureSentAt!, ctx.now, ctx.holidays))
      : null,
    predatesProcess: row.status === 'pending_review' && (ctx.versionCountByCircuitId.get(row.id) ?? 0) === 0,
  };
}

async function viewOf(circuit: Circuit): Promise<DnAnnotationTaskView> {
  const view = buildView(circuit, await loadContext([circuit]));
  if (!view) throw new Error('DN_TASK_NOT_FOUND');
  return view;
}

/** K7d - a pending circuit on a closed dossier is `inactive`: outside the
 *  to_send / with_director lists and counts, still present in the full list. */
export async function listDnAnnotationTasks(filters: { bucket?: string }): Promise<DnCircuitQueueResponse> {
  const rows = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.entityType, ENTITY_TYPE))
    .orderBy(desc(dgCircuitDocuments.depositedAt));
  const ctx = await loadContext(rows);
  const tasks = rows.map((row) => buildView(row, ctx)).filter((task): task is DnCircuitQueueItem => !!task);
  const items = filters.bucket ? tasks.filter((task) => task.bucket === filters.bucket) : tasks;
  return { items, counts: countBuckets(DN_CIRCUIT_BUCKETS, tasks) };
}

/** Assistante DN hands the DG-annotated dossier to the Directeur DN. The
 *  timing (signatureSentAt) is recorded; no automatic alert is attached yet. */
export async function sendToDirector(taskId: string, actorUserId: number): Promise<DnAnnotationTaskView> {
  const requestId = parseTaskId(taskId);
  const updated = await db.transaction(async (tx) => {
    await assertDossierOpen(tx, requestId);
    const [circuit] = await tx
      .select()
      .from(dgCircuitDocuments)
      .where(and(eq(dgCircuitDocuments.entityType, ENTITY_TYPE), eq(dgCircuitDocuments.requestId, requestId)))
      .for('update');
    if (!circuit) throw new Error('DN_TASK_NOT_FOUND');
    if (circuit.status !== 'submitted') throw new Error('INVALID_CIRCUIT_TRANSITION');

    const [sent] = await tx
      .update(dgCircuitDocuments)
      .set({ status: 'in_signature_circuit', signatureSentAt: new Date() })
      .where(eq(dgCircuitDocuments.id, circuit.id))
      .returning();
    await logAudit(
      {
        userId: actorUserId,
        action: 'DN_ANNOTATION_SENT_TO_DIRECTOR',
        module: 'M1',
        entityId: sent.id,
        details: { requestId },
      },
      tx
    );
    return sent;
  });
  return viewOf(updated);
}

/** Assistante DN uploads the Directeur DN annotated return. In ONE transaction:
 *  the file becomes the circuit's current version (the copied DG-annotated file
 *  stays as a trashed version), the circuit moves to pending_review and the
 *  request becomes pending_review - the only place that unlocks M3. */
export async function returnAnnotated(
  taskId: string,
  attachment: PreparedAttachment,
  actorUserId: number
): Promise<DnAnnotationTaskView> {
  const requestId = parseTaskId(taskId);
  let target: RelocationTarget | undefined;

  const updated = await db.transaction(async (tx) => {
    await assertDossierOpen(tx, requestId);
    const [circuit] = await tx
      .select()
      .from(dgCircuitDocuments)
      .where(and(eq(dgCircuitDocuments.entityType, ENTITY_TYPE), eq(dgCircuitDocuments.requestId, requestId)))
      .for('update');
    if (!circuit) throw new Error('DN_TASK_NOT_FOUND');

    target = { ownerType: 'dg_circuit_document', ownerId: circuit.id };
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') return circuit;
    if (circuit.status !== 'in_signature_circuit') throw new Error('INVALID_CIRCUIT_TRANSITION');

    await trashCurrentVersions(tx, 'dg_circuit_document', circuit.id);
    await tx.insert(documentVersions).values(versionValues(attachment, 'dg_circuit_document', circuit.id));
    await linkLockedAsset(tx, attachment.assetId, target);

    const now = new Date();
    const [returned] = await tx
      .update(dgCircuitDocuments)
      .set({ status: 'pending_review', signedAt: now, pendingReviewAt: now })
      .where(eq(dgCircuitDocuments.id, circuit.id))
      .returning();

    const [request] = await tx
      .update(requests)
      .set({ status: 'pending_review', updatedAt: now })
      .where(and(eq(requests.id, requestId), eq(requests.status, 'submitted')))
      .returning({ id: requests.id });
    if (!request) throw new Error('REQUEST_NOT_AWAITING_DN_ANNOTATION');

    await logAudit(
      {
        userId: actorUserId,
        action: 'DN_ANNOTATION_RETURNED',
        module: 'M1',
        entityId: returned.id,
        details: { requestId },
      },
      tx
    );
    return returned;
  });

  if (target) await relocateDossierAssetAfterCommit(attachment.assetId, target);
  return viewOf(updated);
}
