/** Reason stored on a request cancelled by a payment rejection (M5, M6, M7,
 *  action `reject_dossier`). The applicant reads it on their dossier; the
 *  admin shows it before the final confirmation. One definition for both. */
export const DOSSIER_REJECTION_PREFIX = 'Paiement rejeté - dossier annulé : ';

export function dossierRejectionReason(paymentRejectionReason: string): string {
  return `${DOSSIER_REJECTION_PREFIX}${paymentRejectionReason}`;
}
