import { and, eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { dgCircuitDocuments, documentVersions, requests } from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import {
  claimUploadAsset,
  linkLockedAsset,
  trashCurrentVersions,
  versionValues,
  type PreparedAttachment,
} from '../uploads/upload-attachment.js';
import { relocateDossierAssetAfterCommit, type RelocationTarget } from '../files/relocate-asset.js';
import { cleanupGeneratedFileOnFailure } from '../files/generated-file-cleanup.js';
import { assertDossierOpen } from '../requests/dossier-open.js';
import { copyFileForDnCircuit, registerDnCircuitCopy } from './dn-annotation.copy.js';

export interface IntakeDgReturnResult {
  request: typeof requests.$inferSelect;
  circuit: typeof dgCircuitDocuments.$inferSelect;
}

/** SESSION1-M1-1 - the ONE implementation of "the DG-annotated return is
 *  uploaded" for an intake dossier. Both entry points
 *  (courrier-tasks.returnSigned and requests.returnSignedFromDg) call it.
 *
 *  In one transaction: the DG-annotated file becomes the intake circuit's
 *  current version, the intake circuit moves to pending_review, and the
 *  Directeur DN circuit is created idempotently (status submitted) with its own
 *  physical copy of that file.
 *
 *  It deliberately does NOT touch requests.status: the DG return no longer
 *  unlocks M3. Only the Directeur DN return does (dn-annotation.service). */
export async function returnIntakeDgAnnotation(params: {
  requestId: number;
  attachment: PreparedAttachment;
  actorUserId: number;
}): Promise<IntakeDgReturnResult> {
  const { requestId, attachment, actorUserId } = params;
  // K7 - closed dossier: refused before the file copy below.
  await assertDossierOpen(db, requestId);
  const copy = await copyFileForDnCircuit(attachment);
  let copyUsed = false;
  let target: RelocationTarget | undefined;

  try {
    const result = await db.transaction(async (tx) => {
      await assertDossierOpen(tx, requestId);
      // Target first (the intake circuit), then the upload asset - STORAGE-0B.
      const [circuit] = await tx
        .select()
        .from(dgCircuitDocuments)
        .where(
          and(eq(dgCircuitDocuments.requestId, requestId), eq(dgCircuitDocuments.entityType, 'intake_request'))
        )
        .for('update');
      if (!circuit) throw new Error('DG_CIRCUIT_NOT_FOUND');

      target = { ownerType: 'dg_circuit_document', ownerId: circuit.id };
      if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') {
        const [current] = await tx.select().from(requests).where(eq(requests.id, requestId));
        return { request: current, circuit };
      }
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

      const [dnCircuit] = await tx
        .insert(dgCircuitDocuments)
        .values({ entityType: 'dn_director_annotation', requestId, status: 'submitted' })
        .onConflictDoNothing()
        .returning();
      if (dnCircuit) {
        await registerDnCircuitCopy(tx, dnCircuit.id, attachment, copy.storageKey, actorUserId);
        copyUsed = true;
        await logAudit(
          {
            userId: actorUserId,
            action: 'DN_ANNOTATION_CIRCUIT_CREATED',
            module: 'M1',
            entityId: dnCircuit.id,
            details: { requestId },
          },
          tx
        );
      }

      await logAudit(
        {
          userId: actorUserId,
          action: 'DG_ANNOTATION_RETURNED',
          module: 'M1',
          entityId: returned.id,
          details: { requestId },
        },
        tx
      );

      const [request] = await tx.select().from(requests).where(eq(requests.id, requestId));
      return { request, circuit: returned };
    });

    // Retry ('attached_here') or an already existing DN circuit: the copy was not needed.
    if (!copyUsed) await cleanupGeneratedFileOnFailure(copy.storagePath, 'dn-annotation');
    if (target) await relocateDossierAssetAfterCommit(attachment.assetId, target);
    return result;
  } catch (error) {
    await cleanupGeneratedFileOnFailure(copy.storagePath, 'dn-annotation');
    throw error;
  }
}
