import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, copyFile } from 'node:fs/promises';
import { eq, and, ne, desc } from 'drizzle-orm';
import { db, type DbTx } from '../../shared/db/index.js';
import {
  preliminaryEvaluationForms,
  phases,
  requests,
  documentTemplates,
  meetings,
  documentVersions,
  dgCircuitDocuments,
} from '../../shared/db/schema.js';
import { getIntegerValue } from '../system-parameters/system-parameters.service.js';
import { logAudit } from '../auth/auth.service.js';
import {
  claimUploadAsset,
  linkLockedAsset,
  versionValues,
  type PreparedAttachment,
} from '../uploads/upload-attachment.js';
import { insertAssetWithAddress } from '../uploads/asset-registration.js';
import { relocateDossierAssetAfterCommit, type RelocationTarget } from '../files/relocate-asset.js';
import { cleanupGeneratedFileOnFailure } from '../files/generated-file-cleanup.js';
import { resolveStoredFilePath } from '../files/stored-file.js';
import { UPLOADS_ROOT } from '../../shared/uploads-root.js';

export interface PreliminaryEvaluationView {
  id: number;
  phaseId: number;
  templateFileUrl: string | null;
  madeAvailableAt: Date | null;
  returnDeadline: Date | null;
  submittedFileUrl: string | null;
  submittedAt: Date | null;
}

async function toView(
  row: typeof preliminaryEvaluationForms.$inferSelect
): Promise<PreliminaryEvaluationView> {
  let templateFileUrl: string | null = null;
  if (row.templateId) {
    const [template] = await db
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, row.templateId));
    templateFileUrl = template?.fileUrl ?? null;
  }
  return {
    id: row.id,
    phaseId: row.phaseId,
    templateFileUrl,
    madeAvailableAt: row.madeAvailableAt,
    returnDeadline: row.returnDeadline,
    submittedFileUrl: row.submittedFileUrl,
    submittedAt: row.submittedAt,
  };
}

export interface PreliminaryCircuitView {
  status: string;
  fileUrl: string | null;
  signatureSentAt: Date | null;
  signedAt: Date | null;
  pendingReviewAt: Date | null;
}

function toCircuitView(
  row: typeof dgCircuitDocuments.$inferSelect,
  versions: (typeof documentVersions.$inferSelect)[] = []
): PreliminaryCircuitView {
  const current = versions.find((version) => version.isCurrent) ?? null;
  return {
    status: row.status,
    fileUrl: current?.fileUrl ?? null,
    signatureSentAt: row.signatureSentAt,
    signedAt: row.signedAt,
    pendingReviewAt: row.pendingReviewAt,
  };
}

async function getCircuitForRequest(requestId: number): Promise<PreliminaryCircuitView | null> {
  const [circuit] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(and(eq(dgCircuitDocuments.requestId, requestId), eq(dgCircuitDocuments.entityType, 'pre_evaluation')));
  if (!circuit) return null;

  const versions = await db
    .select()
    .from(documentVersions)
    .where(and(eq(documentVersions.ownerType, 'dg_circuit_document'), eq(documentVersions.ownerId, circuit.id)));

  return toCircuitView(circuit, versions);
}

/** PRELIM-DG-CIRCUIT-1 - the DG circuit's own copy must resolve under its
 *  own linked upload_asset (ownerType='dg_circuit_document'), never share
 *  the applicant's asset (ownerType='preliminary_evaluation_form'): file
 *  access is decided solely by which single owner an asset is linked to
 *  (file-access.policy.ts), and only the 'dg_circuit' stage grants
 *  reception/assistant_dg - the M3 stage is DN-only. A physical copy, not a
 *  shared reference, is the only way reception/assistant_dg can open the
 *  file they need to print - without widening M3's own file-access policy.
 *
 *  Written to disk before the business transaction (its id is needed for
 *  the stable address, which only exists after insert - STORAGE-3B/3C
 *  pattern), so a failure anywhere after this point must best-effort delete
 *  it (cleanupGeneratedFileOnFailure) - the applicant's own original upload
 *  is never touched either way. */
async function copySubmittedFileForCircuit(
  attachment: PreparedAttachment
): Promise<{ storageKey: string; storagePath: string }> {
  const sourcePath = await resolveStoredFilePath(attachment.fileUrl);
  if (!sourcePath) throw new Error('UPLOAD_FILE_MISSING');

  const extension = path.extname(attachment.originalName);
  const fileName = `${randomUUID()}${extension}`;
  const storageKey = `generated/preliminary-evaluation-circuit/${fileName}`;
  const storagePath = path.join(UPLOADS_ROOT, 'generated', 'preliminary-evaluation-circuit', fileName);

  await mkdir(path.dirname(storagePath), { recursive: true });
  await copyFile(sourcePath, storagePath);

  return { storageKey, storagePath };
}

/** Registers the circuit's own copy as a brand-new upload_asset (never the
 *  applicant's), linked to the circuit row created in the same transaction.
 *  Preserves the original filename/MIME/size from the applicant's upload. */
async function registerCircuitCopy(
  tx: DbTx,
  circuitId: number,
  attachment: PreparedAttachment,
  storageKey: string
): Promise<void> {
  const { address } = await insertAssetWithAddress(tx, {
    storageKey,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    uploadedFromApp: 'api',
    moduleHint: 'preliminary-eval',
    linkedOwnerType: 'dg_circuit_document',
    linkedOwnerId: circuitId,
    linkedAt: new Date(),
  });

  await tx.insert(documentVersions).values({
    ownerType: 'dg_circuit_document',
    ownerId: circuitId,
    fileUrl: address,
    mimeType: attachment.mimeType,
    uploadedBy: null,
    isCurrent: true,
  });
}

export async function getForPhase(phaseId: number): Promise<PreliminaryEvaluationView | null> {
  const [row] = await db
    .select()
    .from(preliminaryEvaluationForms)
    .where(eq(preliminaryEvaluationForms.phaseId, phaseId));
  return row ? toView(row) : null;
}

/** M3 - DN makes the blank declaration available to the applicant, after
 *  the preliminary meeting. Uses whatever template is currently active for
 *  the 'preliminary_evaluation_declaration' key (see document-templates
 *  module) - must be configured first. */
export async function makeAvailable(
  phaseId: number,
  actorUserId: number,
  returnDays?: number
): Promise<PreliminaryEvaluationView> {
  const [phase] = await db.select().from(phases).where(eq(phases.id, phaseId));
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  if (phase.phaseCode !== 'M3') throw new Error('WRONG_PHASE');
  if (phase.status !== 'open') throw new Error('PHASE_NOT_OPEN');

  const [heldMeeting] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.phaseId, phaseId), eq(meetings.status, 'held')));
  if (!heldMeeting) throw new Error('MEETING_NOT_HELD_YET');

  const [template] = await db
    .select()
    .from(documentTemplates)
    .where(eq(documentTemplates.key, 'preliminary_evaluation_declaration'));
  if (!template || !template.active || !template.fileUrl) {
    throw new Error('TEMPLATE_NOT_CONFIGURED');
  }

  const days = returnDays ?? (await getIntegerValue('preliminary_evaluation_return_days', 15));
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + days);

  const [existing] = await db
    .select()
    .from(preliminaryEvaluationForms)
    .where(eq(preliminaryEvaluationForms.phaseId, phaseId));

  let row: typeof preliminaryEvaluationForms.$inferSelect;
  if (existing) {
    [row] = await db
      .update(preliminaryEvaluationForms)
      .set({ templateId: template.id, madeAvailableAt: new Date(), returnDeadline: deadline })
      .where(eq(preliminaryEvaluationForms.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(preliminaryEvaluationForms)
      .values({
        phaseId,
        templateId: template.id,
        madeAvailableAt: new Date(),
        returnDeadline: deadline,
      })
      .returning();
  }

  await logAudit({
    userId: actorUserId,
    action: 'PRELIMINARY_EVALUATION_MADE_AVAILABLE',
    module: 'M3',
    entityId: row.id,
    details: { returnDays: days },
  });

  return toView(row);
}

/** Applicant only (route: requireApplicant); ownership is enforced by the
 *  controller (phase -> request -> applicantId check) before this is
 *  called. One-shot: PRELIM-DG-CIRCUIT-1 blocks any resubmission once a
 *  declaration has been submitted (even while the circuit is still
 *  'submitted', not yet printed) - once submitted, the physical DG circuit
 *  owns the process and a silent replacement would leave reception
 *  printing an unknown version. Matches the formal-request letter's
 *  existing one-shot policy (LETTER_ALREADY_SUBMITTED).
 *
 *  Transactionally establishes both document identities in one commit:
 *  (A) the applicant's own submitted version (preliminary_evaluation_form,
 *  unchanged from before this task) and (B) a brand-new pre_evaluation DG
 *  circuit with its own, separately-linked copy of the file (see
 *  copySubmittedFileForCircuit's doc comment for why a copy, not a shared
 *  reference, is required). The copy is written to disk before the
 *  transaction opens (its id/address only exist after insert); any failure
 *  from that point on - including the idempotent 'attached_here' retry,
 *  which never needed the copy - deletes it (best-effort, logged on
 *  failure), never the applicant's original upload. */
export async function submit(
  phaseId: number,
  attachment: PreparedAttachment
): Promise<PreliminaryEvaluationView> {
  let target: RelocationTarget | undefined;
  const circuitCopy = await copySubmittedFileForCircuit(attachment);
  let circuitCopyUsed = false;

  try {
    const updated = await db.transaction(async (tx) => {
      // Target first: the evaluation form row, then the upload asset.
      const [row] = await tx
        .select()
        .from(preliminaryEvaluationForms)
        .where(eq(preliminaryEvaluationForms.phaseId, phaseId))
        .for('update');
      if (!row || !row.madeAvailableAt) throw new Error('NOT_YET_AVAILABLE');

      target = { ownerType: 'preliminary_evaluation_form', ownerId: row.id };
      if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') return row;

      if (row.submittedFileUrl) throw new Error('DECLARATION_ALREADY_SUBMITTED');

      const [phase] = await tx.select().from(phases).where(eq(phases.id, phaseId));
      if (!phase) throw new Error('PHASE_NOT_FOUND');

      await tx.insert(documentVersions).values(versionValues(attachment, 'preliminary_evaluation_form', row.id));
      await linkLockedAsset(tx, attachment.assetId, target);

      const [saved] = await tx
        .update(preliminaryEvaluationForms)
        .set({ submittedFileUrl: attachment.fileUrl, submittedAt: new Date() })
        .where(eq(preliminaryEvaluationForms.id, row.id))
        .returning();

      const [circuit] = await tx
        .insert(dgCircuitDocuments)
        .values({ entityType: 'pre_evaluation', requestId: phase.requestId, status: 'submitted' })
        .returning();

      await registerCircuitCopy(tx, circuit.id, attachment, circuitCopy.storageKey);
      circuitCopyUsed = true;

      await logAudit(
        {
          action: 'PRELIMINARY_EVALUATION_SUBMITTED',
          module: 'M3',
          entityId: row.id,
          details: { mimeType: attachment.mimeType },
        },
        tx
      );
      await logAudit(
        {
          action: 'PRELIMINARY_DECLARATION_CIRCUIT_CREATED',
          module: 'M3',
          entityId: circuit.id,
          details: { requestId: phase.requestId },
        },
        tx
      );
      return saved;
    });

    if (!circuitCopyUsed) {
      // 'attached_here' idempotent retry - the copy made before the
      // transaction opened turned out to be unnecessary.
      await cleanupGeneratedFileOnFailure(circuitCopy.storagePath, 'preliminary-evaluation');
    }

    if (target) await relocateDossierAssetAfterCommit(attachment.assetId, target);
    return toView(updated);
  } catch (error) {
    await cleanupGeneratedFileOnFailure(circuitCopy.storagePath, 'preliminary-evaluation');
    throw error;
  }
}

/** Helper for controllers doing the ownership check: phase -> request -> applicantId. */
export async function getRequestIdForPhase(
  phaseId: number
): Promise<{ requestId: number; applicantId: number } | null> {
  const [phase] = await db.select().from(phases).where(eq(phases.id, phaseId));
  if (!phase) return null;
  const [request] = await db.select().from(requests).where(eq(requests.id, phase.requestId));
  if (!request) return null;
  return { requestId: request.id, applicantId: request.applicantId };
}

export interface PreliminaryPhaseBundle {
  phase: { id: number; status: string; openedAt: Date; closedAt: Date | null } | null;
  meeting: {
    id: number;
    scheduledAt: Date;
    location: string | null;
    status: string;
    crDocumentUrl: string | null;
    crUploadedAt: Date | null;
  } | null;
  evaluation: PreliminaryEvaluationView | null;
  circuit: PreliminaryCircuitView | null;
}

/** Single-call bundle for the portal - avoids exposing the staff-only
 *  phases/meetings endpoints to applicants just to assemble one screen.
 *  Ownership (does this request belong to the calling applicant) is
 *  enforced by the controller before this runs. */
export async function getBundleForRequest(requestId: number): Promise<PreliminaryPhaseBundle> {
  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M3')));

  if (!phase) {
    return { phase: null, meeting: null, evaluation: null, circuit: null };
  }

  // "Current" meeting = most recent non-superseded row - covers scheduled
  // (upcoming), held (with or without a CR yet), and no_show alike, but
  // not "rescheduled" ones since those were replaced by a newer row.
  const [meetingRow] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.phaseId, phase.id), ne(meetings.status, 'rescheduled')))
    .orderBy(desc(meetings.scheduledAt));

  const evaluation = await getForPhase(phase.id);
  const circuit = await getCircuitForRequest(requestId);

  return {
    phase: {
      id: phase.id,
      status: phase.status,
      openedAt: phase.openedAt,
      closedAt: phase.closedAt,
    },
    meeting: meetingRow
      ? {
          id: meetingRow.id,
          scheduledAt: meetingRow.scheduledAt,
          location: meetingRow.location,
          status: meetingRow.status,
          crDocumentUrl: meetingRow.crDocumentUrl,
          crUploadedAt: meetingRow.crUploadedAt,
        }
      : null,
    evaluation,
    circuit,
  };
}
