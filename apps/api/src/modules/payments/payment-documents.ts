/** STORAGE-0B - invoice (S5) and proof of payment (applicant) attachment,
 *  shared by the M5 / M6 / M7 payment steps, which were three identical
 *  copies. Each runs in one transaction: payment row locked, then the upload
 *  asset, then version + payment update + link + audit. */
import { eq } from 'drizzle-orm';
import { db, type DbTx } from '../../shared/db/index.js';
import { documentVersions, payments, phases, requests } from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import {
  claimUploadAsset,
  linkLockedAsset,
  trashCurrentVersions,
  versionValues,
  type PreparedAttachment,
} from '../uploads/upload-attachment.js';
import { relocateDossierAssetAfterCommit, type RelocationTarget } from '../files/relocate-asset.js';

export type PaymentPhaseCode = 'M5' | 'M6' | 'M7';
type PaymentRow = typeof payments.$inferSelect;

/** The payment of a phase of the expected kind, locked. An endpoint of one
 *  module cannot reach another module's payment. */
async function lockPhasePayment(
  tx: DbTx,
  phaseId: number,
  phaseCode: PaymentPhaseCode
): Promise<{ payment: PaymentRow; requestId: number }> {
  const [phase] = await tx.select().from(phases).where(eq(phases.id, phaseId));
  if (!phase || phase.phaseCode !== phaseCode) throw new Error('PAYMENT_NOT_FOUND');
  const [payment] = await tx.select().from(payments).where(eq(payments.phaseId, phaseId)).for('update');
  if (!payment) throw new Error('PAYMENT_NOT_FOUND');
  return { payment, requestId: phase.requestId };
}

export async function attachPaymentInvoice(
  phaseId: number,
  phaseCode: PaymentPhaseCode,
  attachment: PreparedAttachment,
  actorUserId: number
): Promise<PaymentRow> {
  let target: RelocationTarget | undefined;
  const result = await db.transaction(async (tx) => {
    const { payment } = await lockPhasePayment(tx, phaseId, phaseCode);
    target = { ownerType: 'payment_invoice', ownerId: payment.id };
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') return payment;

    // VERSION-CURRENT-DISCIPLINE - a re-uploaded invoice must supersede the
    // previous one, never coexist as a second current row.
    await trashCurrentVersions(tx, 'payment_invoice', payment.id);
    await tx.insert(documentVersions).values(versionValues(attachment, 'payment_invoice', payment.id));
    await linkLockedAsset(tx, attachment.assetId, target);

    const [updated] = await tx
      .update(payments)
      .set({ invoiceFileUrl: attachment.fileUrl, invoiceUploadedAt: new Date(), status: 'awaiting_proof' })
      .where(eq(payments.id, payment.id))
      .returning();

    await logAudit({ userId: actorUserId, action: 'INVOICE_UPLOADED', module: phaseCode, entityId: payment.id }, tx);
    return updated;
  });

  if (target) await relocateDossierAssetAfterCommit(attachment.assetId, target);
  return result;
}

/** The phase must belong to the request in the URL, and that request to the
 *  applicant (D6) - otherwise "not found", never someone else's payment. */
export async function attachPaymentProof(
  phaseId: number,
  requestId: number,
  applicantId: number,
  phaseCode: PaymentPhaseCode,
  attachment: PreparedAttachment
): Promise<PaymentRow> {
  let target: RelocationTarget | undefined;
  const result = await db.transaction(async (tx) => {
    const { payment, requestId: phaseRequestId } = await lockPhasePayment(tx, phaseId, phaseCode);
    const [request] = await tx.select().from(requests).where(eq(requests.id, phaseRequestId));
    if (phaseRequestId !== requestId || !request || request.applicantId !== applicantId) {
      throw new Error('PAYMENT_NOT_FOUND');
    }

    target = { ownerType: 'payment_proof', ownerId: payment.id };
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') return payment;
    if (!payment.invoiceFileUrl) throw new Error('INVOICE_NOT_UPLOADED');
    if (payment.status === 'validated') throw new Error('PAYMENT_ALREADY_VALIDATED');

    // VERSION-CURRENT-DISCIPLINE - a re-uploaded proof must supersede the
    // previous one, never coexist as a second current row.
    await trashCurrentVersions(tx, 'payment_proof', payment.id);
    await tx.insert(documentVersions).values(versionValues(attachment, 'payment_proof', payment.id));
    await linkLockedAsset(tx, attachment.assetId, target);

    const [updated] = await tx
      .update(payments)
      .set({ proofFileUrl: attachment.fileUrl, proofUploadedAt: new Date(), status: 'pending_validation' })
      .where(eq(payments.id, payment.id))
      .returning();

    await logAudit({ action: 'PAYMENT_PROOF_UPLOADED', module: phaseCode, entityId: payment.id }, tx);
    return updated;
  });

  if (target) await relocateDossierAssetAfterCommit(attachment.assetId, target);
  return result;
}
