/** FINANCE-LABELS-1 - what a Finance invoice is for, from the payment's
 *  phase and the dossier's request type. The one source of this wording:
 *  the Finance queue (API), /paiements-s5, the phase payment cards and the
 *  Demandes cockpit all read it here. Pure, no I/O.
 *
 *  Workshop 24/10/2026:
 *  recognition/issuance labels validated.
 *  modification/renewal wording pending business confirmation.
 *  The audit (M6) and delivery (M7) labels are neutral contextual wording,
 *  not validated titles: Inspection V2 / Delivery V2 will set them. */

/** Mirrors the request_type DB enum (unchanged). */
export const OMA_REQUEST_TYPES = ['recognition', 'issuance', 'modification', 'renewal'] as const;
export type OmaRequestType = (typeof OMA_REQUEST_TYPES)[number];

/** The phases with a Finance payment. */
export type FinancePhaseCode = 'M5' | 'M6' | 'M7';

/** How Finance names the request type (never the raw enum value). */
export const FINANCE_REQUEST_TYPE_LABELS: Record<OmaRequestType, string> = {
  recognition: 'Reconnaissance d’agrément',
  issuance: 'Certification d’un OMA',
  modification: 'Modification',
  renewal: 'Renouvellement',
};

/** M5 - Évaluation approfondie: the study fee. */
const STUDY_FEE_LABELS: Record<OmaRequestType, string> = {
  // Validated (workshop 24/10/2026).
  recognition: 'Frais d’étude de Reconnaissance d’agrément',
  issuance: 'Frais d’étude de Certification d’un OMA',
  // Provisional - business wording pending confirmation.
  modification: 'Frais d’étude de Modification d’un agrément OMA',
  renewal: 'Frais d’étude de Renouvellement d’un agrément OMA',
};

/** Unknown phase or request type (historical data): never the raw value. */
export const FINANCE_INVOICE_FALLBACK_LABEL = 'Frais liés au dossier OMA';

const isRequestType = (value: string): value is OmaRequestType =>
  (OMA_REQUEST_TYPES as readonly string[]).includes(value);

/** The request type as Finance reads it, or null when unknown. */
export function financeRequestTypeLabel(requestType: string): string | null {
  return isRequestType(requestType) ? FINANCE_REQUEST_TYPE_LABELS[requestType] : null;
}

const INVOICE_LABEL_BY_PHASE: Record<FinancePhaseCode, (requestType: OmaRequestType) => string> = {
  M5: (requestType) => STUDY_FEE_LABELS[requestType],
  // M6 - Démonstration / Inspection: audit fee (neutral wording).
  M6: (requestType) => `Frais d’audit - ${FINANCE_REQUEST_TYPE_LABELS[requestType]}`,
  // M7 - Délivrance: delivery fee (neutral wording).
  M7: (requestType) => `Frais de délivrance - ${FINANCE_REQUEST_TYPE_LABELS[requestType]}`,
};

/** « Objet de la facture »: what the invoice of this phase is for. */
export function financeInvoiceLabel({ phaseCode, requestType }: { phaseCode: string; requestType: string }): string {
  if (!isRequestType(requestType) || !Object.hasOwn(INVOICE_LABEL_BY_PHASE, phaseCode)) {
    return FINANCE_INVOICE_FALLBACK_LABEL;
  }
  return INVOICE_LABEL_BY_PHASE[phaseCode as FinancePhaseCode](requestType);
}
