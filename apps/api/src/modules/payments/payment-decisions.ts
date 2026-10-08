/** K4 - S5 decisions on a proof of payment, shared by the M5 / M6 / M7
 *  payment steps (their rejectPayment were three identical copies).
 *
 *  A rejection runs in one transaction: the payment row is locked (and
 *  checked to belong to the calling module's phase), then the payment, the
 *  request when the dossier is cancelled, and the audit row are written
 *  together - either all of them or none.
 *
 *  K5 - a validation follows the same path (`validatePhasePaymentInTx`):
 *  row locked, module checked, status read under the lock. M7 runs it inside
 *  the transaction that also creates the certificate.
 *
 *  Concurrency: the status is read under the row lock and every decision
 *  update is conditioned on `pending_validation` (`stillPendingPayment`), so
 *  a validation and a rejection of the same proof can never both succeed. */
import { and, eq } from 'drizzle-orm';
import { dossierRejectionReason } from '@aidn/shared';
import { db, type DbTx } from '../../shared/db/index.js';
import { payments, requests } from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { lockPhasePayment, type PaymentPhaseCode } from './payment-documents.js';

type PaymentRow = typeof payments.$inferSelect;
export type PaymentRejectionAction = 'request_new_proof' | 'reject_dossier';

/** WHERE clause for a decision update: that payment, only if still awaiting
 *  a decision. An update that matches no row means another decision won. */
export function stillPendingPayment(paymentId: number) {
  return and(eq(payments.id, paymentId), eq(payments.status, 'pending_validation'));
}

export async function rejectPhasePayment(params: {
  phaseId: number;
  phaseCode: PaymentPhaseCode;
  actorUserId: number;
  rejectionAction: PaymentRejectionAction;
  rejectionReason: string;
}): Promise<PaymentRow> {
  const { phaseId, phaseCode, actorUserId, rejectionAction, rejectionReason } = params;
  const cancelsDossier = rejectionAction === 'reject_dossier';

  return db.transaction(async (tx) => {
    const { payment, requestId } = await lockPhasePayment(tx, phaseId, phaseCode);
    if (payment.status !== 'pending_validation') throw new Error('PAYMENT_NOT_PENDING');

    const [updated] = await tx
      .update(payments)
      .set({
        status: cancelsDossier ? 'rejected' : 'awaiting_proof',
        rejectionAction,
        rejectionReason,
      })
      .where(eq(payments.id, payment.id))
      .returning();

    if (cancelsDossier) {
      const [request] = await tx
        .update(requests)
        .set({
          status: 'rejected',
          rejectionReason: dossierRejectionReason(rejectionReason),
          updatedAt: new Date(),
        })
        .where(eq(requests.id, requestId))
        .returning({ id: requests.id });
      if (!request) throw new Error('REQUEST_NOT_FOUND');
    }

    await logAudit(
      {
        userId: actorUserId,
        action: 'PAYMENT_REJECTED',
        module: phaseCode,
        entityId: payment.id,
        details: { rejectionAction },
      },
      tx
    );

    return updated;
  });
}

/** Validates the payment of a phase inside the caller's transaction (M7
 *  creates the certificate in the same one). Locks the row, checks the phase
 *  belongs to `phaseCode` (else PAYMENT_NOT_FOUND) and that the proof still
 *  awaits a decision (else PAYMENT_NOT_PENDING); writes the audit row. */
export async function validatePhasePaymentInTx(
  tx: DbTx,
  params: { phaseId: number; phaseCode: PaymentPhaseCode; actorUserId: number }
): Promise<{ payment: PaymentRow; requestId: number }> {
  const { phaseId, phaseCode, actorUserId } = params;
  const { payment, requestId } = await lockPhasePayment(tx, phaseId, phaseCode);
  if (payment.status !== 'pending_validation') throw new Error('PAYMENT_NOT_PENDING');

  const [updated] = await tx
    .update(payments)
    .set({ status: 'validated', validatedBy: actorUserId, validatedAt: new Date() })
    .where(stillPendingPayment(payment.id))
    .returning();
  if (!updated) throw new Error('PAYMENT_NOT_PENDING');

  await logAudit(
    { userId: actorUserId, action: 'PAYMENT_VALIDATED', module: phaseCode, entityId: payment.id },
    tx
  );
  return { payment: updated, requestId };
}

/** M5 / M6: the validation is the whole decision. */
export async function validatePhasePayment(params: {
  phaseId: number;
  phaseCode: PaymentPhaseCode;
  actorUserId: number;
}): Promise<PaymentRow> {
  const { payment } = await db.transaction((tx) => validatePhasePaymentInTx(tx, params));
  return payment;
}
