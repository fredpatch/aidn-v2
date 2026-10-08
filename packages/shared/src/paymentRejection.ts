/** Reason stored on a request cancelled by a payment rejection (M5, M6, M7,
 *  action `reject_dossier`). The applicant reads it on their dossier; the
 *  admin shows it before the final confirmation. One definition for both. */
export const DOSSIER_REJECTION_PREFIX = 'Paiement rejeté - dossier annulé : ';

export function dossierRejectionReason(paymentRejectionReason: string): string {
  return `${DOSSIER_REJECTION_PREFIX}${paymentRejectionReason}`;
}

/** K8 - the two decisions an S5 rejection can take (DB enum
 *  `payment_rejection_action`), checked by the API before any write. */
export const PAYMENT_REJECTION_ACTIONS = ['request_new_proof', 'reject_dossier'] as const;
export type PaymentRejectionAction = (typeof PAYMENT_REJECTION_ACTIONS)[number];

/** K8 - longest rejection reason accepted (after trimming). The applicant
 *  reads it on their dossier; the admin forms use the same limit. */
export const PAYMENT_REJECTION_REASON_MAX_LENGTH = 1000;
