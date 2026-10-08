/** K8 - request body of the S5 payment rejection (M5, M6, M7 share it).
 *
 *  Before K8 the controllers only checked that both fields were truthy: a
 *  reason made of spaces was stored (and shown to the applicant), and an
 *  unknown action reached PostgreSQL's enum and came back as a 500. The body
 *  is now checked here, before any lookup or write; each failure is a 400
 *  (codes mapped once for every module in shared/utils/error.ts). */
import {
  PAYMENT_REJECTION_ACTIONS,
  PAYMENT_REJECTION_REASON_MAX_LENGTH,
  type PaymentRejectionAction,
} from '@aidn/shared';

export interface PaymentRejectionInput {
  rejectionAction: PaymentRejectionAction;
  /** Trimmed. */
  rejectionReason: string;
}

function isRejectionAction(value: unknown): value is PaymentRejectionAction {
  return (PAYMENT_REJECTION_ACTIONS as readonly unknown[]).includes(value);
}

export function parsePaymentRejection(body: unknown): PaymentRejectionInput {
  const { rejectionAction, rejectionReason } = (body ?? {}) as Record<string, unknown>;
  if (!isRejectionAction(rejectionAction)) throw new Error('REJECTION_ACTION_INVALID');
  const reason = typeof rejectionReason === 'string' ? rejectionReason.trim() : '';
  if (!reason) throw new Error('REJECTION_REASON_REQUIRED');
  if (reason.length > PAYMENT_REJECTION_REASON_MAX_LENGTH) throw new Error('REJECTION_REASON_TOO_LONG');
  return { rejectionAction, rejectionReason: reason };
}
