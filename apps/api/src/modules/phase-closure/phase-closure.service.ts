import { eq } from 'drizzle-orm';
import type { PhaseClosureStatus, PhaseClosureView } from '@aidn/shared';
import { db, type DbExecutor, type DbTx } from '../../shared/db/index.js';
import { documentVersions, phaseClosureCircuits, phases } from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import {
  claimUploadAsset,
  linkLockedAsset,
  trashCurrentVersions,
  versionValues,
  type PreparedAttachment,
} from '../uploads/upload-attachment.js';
import { relocateDossierAssetAfterCommit, type RelocationTarget } from '../files/relocate-asset.js';
import { assertPhaseDossierOpen } from '../requests/dossier-open.js';
import { assertPhaseReadyForClosure } from './phase-closure.policy.js';

/** WORKFLOW-FOUNDATION-1A - the one workflow that closes a phase: the
 *  closure courrier is deposited (business readiness checked), goes into the
 *  DG signature circuit, and its signed return closes the phase in the same
 *  transaction. phases.status stays open/closed; the courrier's progress
 *  lives in phase_closure_circuits. Both documents are versions of the
 *  phase_closure_document owner (id = phase id): the draft goes to the trash
 *  (history, never deleted) when the signed return becomes current, and
 *  phases.closure_document_url keeps pointing at the signed return.
 *
 *  Closing a phase never completes the dossier here: M7 / dossier completion
 *  belongs to the Delivery integration. */

type ClosureRow = typeof phaseClosureCircuits.$inferSelect;
type PhaseRow = typeof phases.$inferSelect;

function toPhaseClosureView(row: ClosureRow): PhaseClosureView {
  return {
    id: row.id,
    phaseId: row.phaseId,
    requestId: row.requestId,
    status: row.status as PhaseClosureStatus,
    draftDocumentUrl: row.draftDocumentUrl,
    signedDocumentUrl: row.signedDocumentUrl,
    submittedAt: row.submittedAt.toISOString(),
    signatureSentAt: row.signatureSentAt?.toISOString() ?? null,
    signedAt: row.signedAt?.toISOString() ?? null,
  };
}

const closureTarget = (phaseId: number): RelocationTarget => ({ ownerType: 'phase_closure_document', ownerId: phaseId });

const auditDetails = (phase: PhaseRow) => ({ phaseId: phase.id, phaseCode: phase.phaseCode, requestId: phase.requestId });

async function lockPhase(tx: DbTx, phaseId: number): Promise<PhaseRow> {
  const [phase] = await tx.select().from(phases).where(eq(phases.id, phaseId)).for('update');
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  return phase;
}

async function lockClosure(tx: DbTx, closureId: number): Promise<ClosureRow> {
  const [closure] = await tx.select().from(phaseClosureCircuits).where(eq(phaseClosureCircuits.id, closureId)).for('update');
  if (!closure) throw new Error('PHASE_CLOSURE_NOT_FOUND');
  return closure;
}

/** Transitional direct close paths (closePhase / closeFormalPhase /
 *  closeDeepEvaluationPhase) refuse a phase whose closure courrier has
 *  started: once it exists, only its signed return may close the phase. */
export async function assertNoPhaseClosureCircuit(executor: DbExecutor, phaseId: number): Promise<void> {
  const [existing] = await executor
    .select({ id: phaseClosureCircuits.id })
    .from(phaseClosureCircuits)
    .where(eq(phaseClosureCircuits.phaseId, phaseId));
  if (existing) throw new Error('PHASE_CLOSURE_IN_PROGRESS');
}

export async function getPhaseClosure(phaseId: number): Promise<PhaseClosureView | null> {
  const [phase] = await db.select({ id: phases.id }).from(phases).where(eq(phases.id, phaseId));
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  const [closure] = await db.select().from(phaseClosureCircuits).where(eq(phaseClosureCircuits.phaseId, phaseId));
  return closure ? toPhaseClosureView(closure) : null;
}

/** DN deposits the closure courrier of a business-ready open phase. The
 *  phase stays open. Retrying with the same file returns the same circuit. */
export async function startPhaseClosure(
  phaseId: number,
  actorUserId: number,
  attachment: PreparedAttachment
): Promise<PhaseClosureView> {
  const target = closureTarget(phaseId);
  const { closure, attached } = await db.transaction(async (tx) => {
    // K7 - closed dossier: read-only (requests/dossier-open.ts).
    await assertPhaseDossierOpen(tx, phaseId);
    const phase = await lockPhase(tx, phaseId);
    if (phase.status !== 'open') throw new Error('PHASE_ALREADY_CLOSED');
    await assertPhaseReadyForClosure(tx, phase);

    const [existing] = await tx.select().from(phaseClosureCircuits).where(eq(phaseClosureCircuits.phaseId, phaseId));
    if (existing) {
      if (existing.draftDocumentUrl === attachment.fileUrl) return { closure: existing, attached: false };
      throw new Error('PHASE_CLOSURE_ALREADY_EXISTS');
    }
    // Already on this phase's closure owner without a circuit: an old
    // closure file, never the draft of a new courrier.
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') throw new Error('UPLOAD_ASSET_ALREADY_LINKED');

    await trashCurrentVersions(tx, 'phase_closure_document', phaseId);
    await tx.insert(documentVersions).values(versionValues(attachment, 'phase_closure_document', phaseId));
    await linkLockedAsset(tx, attachment.assetId, target);

    const [created] = await tx
      .insert(phaseClosureCircuits)
      .values({ phaseId, requestId: phase.requestId, draftDocumentUrl: attachment.fileUrl, createdBy: actorUserId })
      .returning();
    await logAudit(
      {
        userId: actorUserId,
        action: 'PHASE_CLOSURE_CREATED',
        module: phase.phaseCode,
        entityId: created.id,
        requestId: phase.requestId,
        details: auditDetails(phase),
      },
      tx
    );
    return { closure: created, attached: true };
  });

  if (attached) await relocateDossierAssetAfterCommit(attachment.assetId, target);
  return toPhaseClosureView(closure);
}

/** The courrier leaves for the DG signature circuit: submitted ->
 *  in_signature_circuit. The phase stays open. */
export async function markPhaseClosureInCircuit(closureId: number, actorUserId: number): Promise<PhaseClosureView> {
  const updated = await db.transaction(async (tx) => {
    const closure = await lockClosure(tx, closureId);
    await assertPhaseDossierOpen(tx, closure.phaseId);
    if (closure.status !== 'submitted') throw new Error('INVALID_PHASE_CLOSURE_TRANSITION');
    const [phase] = await tx.select().from(phases).where(eq(phases.id, closure.phaseId));

    const now = new Date();
    const [row] = await tx
      .update(phaseClosureCircuits)
      .set({ status: 'in_signature_circuit', signatureSentAt: now, updatedAt: now })
      .where(eq(phaseClosureCircuits.id, closureId))
      .returning();
    await logAudit(
      {
        userId: actorUserId,
        action: 'PHASE_CLOSURE_SENT_TO_DG',
        module: phase.phaseCode,
        entityId: closureId,
        requestId: phase.requestId,
        details: auditDetails(phase),
      },
      tx
    );
    return row;
  });
  return toPhaseClosureView(updated);
}

/** The signed courrier comes back: one transaction records it, closes the
 *  phase (same timestamp, closure_document_url = signed return) and audits
 *  both. Retrying with the same file returns the closed circuit. */
export async function recordPhaseClosureReturn(
  closureId: number,
  actorUserId: number,
  attachment: PreparedAttachment
): Promise<PhaseClosureView> {
  const { closure, attached } = await db.transaction(async (tx) => {
    const locked = await lockClosure(tx, closureId);
    await assertPhaseDossierOpen(tx, locked.phaseId);
    const phase = await lockPhase(tx, locked.phaseId);
    if (locked.status === 'signed_returned' && locked.signedDocumentUrl === attachment.fileUrl) {
      return { closure: locked, attached: false };
    }
    if (locked.status !== 'in_signature_circuit') throw new Error('INVALID_PHASE_CLOSURE_TRANSITION');
    if (phase.status !== 'open') throw new Error('PHASE_ALREADY_CLOSED');

    const target = closureTarget(phase.id);
    // Already on this owner: the draft (or an old closure file) sent again
    // as the signed return.
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') throw new Error('UPLOAD_ASSET_ALREADY_LINKED');
    await trashCurrentVersions(tx, 'phase_closure_document', phase.id);
    await tx.insert(documentVersions).values(versionValues(attachment, 'phase_closure_document', phase.id));
    await linkLockedAsset(tx, attachment.assetId, target);

    const now = new Date();
    const [returned] = await tx
      .update(phaseClosureCircuits)
      .set({ status: 'signed_returned', signedAt: now, signedDocumentUrl: attachment.fileUrl, updatedAt: now })
      .where(eq(phaseClosureCircuits.id, closureId))
      .returning();
    await tx
      .update(phases)
      .set({ status: 'closed', closedAt: now, closureDocumentUrl: attachment.fileUrl })
      .where(eq(phases.id, phase.id));

    const details = auditDetails(phase);
    await logAudit(
      {
        userId: actorUserId,
        action: 'PHASE_CLOSURE_RETURNED',
        module: phase.phaseCode,
        entityId: closureId,
        requestId: phase.requestId,
        details,
      },
      tx
    );
    await logAudit(
      {
        userId: actorUserId,
        action: 'PHASE_CLOSED',
        module: phase.phaseCode,
        entityId: phase.id,
        requestId: phase.requestId,
        details: { ...details, closureId },
      },
      tx
    );
    return { closure: returned, attached: true };
  });

  if (attached) await relocateDossierAssetAfterCommit(attachment.assetId, closureTarget(closure.phaseId));
  return toPhaseClosureView(closure);
}
