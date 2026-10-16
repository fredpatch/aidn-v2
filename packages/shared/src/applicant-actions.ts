import type { InternalRole } from './statuses.js';

/** SESSION1-UX-1 - every action AIDN expects from the applicant. Only actions
 *  actually expected now - never a passive waiting state. */
export const APPLICANT_ACTION_KEYS = [
  'meeting_confirmation',
  'signed_meeting_report',
  'preliminary_declaration',
  'formal_letter',
  'formal_missing_documents',
  'payment_proof',
  'document_correction',
  'certificate_collection',
] as const;
export type ApplicantActionKey = (typeof APPLICANT_ACTION_KEYS)[number];
export type ApplicantActionPhase = 'M3' | 'M4' | 'M5' | 'M6' | 'M7';

/** Base priority, lower first. Keys below 80 block their phase. */
export const APPLICANT_ACTION_PRIORITY: Record<ApplicantActionKey, number> = {
  meeting_confirmation: 10, // an unconfirmed meeting cannot be held (MEETING_NOT_CONFIRMED)
  payment_proof: 20, // closure needs a validated payment (PAYMENT_NOT_VALIDATED)
  document_correction: 30, // DOCUMENTS_NOT_ALL_VALIDATED
  formal_letter: 40, // formal meeting and closure (LETTER_NOT_TRANSMITTED)
  formal_missing_documents: 50, // DOCUMENTS_INCOMPLETE
  preliminary_declaration: 60, // M3 closure
  signed_meeting_report: 80, // never blocks (SESSION1-MEET-2)
  certificate_collection: 90, // physical, final step
};

/** An action due within this many hours (or overdue) is urgent. Ordering only:
 *  no SLA, no business deadline. */
export const URGENCY_WINDOW_HOURS = 72;

export interface ApplicantAction {
  /** `${key}:${requestId}:${subjectId}` - unique in a response. */
  id: string;
  key: ApplicantActionKey;
  requestId: number;
  requestReference: string;
  phaseCode: ApplicantActionPhase;
  priority: number;
  urgent: boolean;
  /** Dossier page fragment without '#'. */
  anchor: string;
  dueAt: string | null;
  count?: number;
  variant?: 'after_rejection';
}

/** Admin - who must act next. */
export type OperationalState = 'action_required' | 'waiting' | 'information' | 'done' | 'blocked';

export interface NextActionOwner {
  kind: 'staff' | 'applicant' | 'external';
  label: string;
  /** staff only: exactly the requireRole(...) list of the route that performs the action. */
  roles?: InternalRole[];
}

// ── M3 declaration ─────────────────────────────────────────────────────────
interface DeclarationForm {
  madeAvailableAt: unknown | null;
  submittedFileUrl: string | null;
}
/** The route accepts a declaration (NOT_YET_AVAILABLE / DECLARATION_ALREADY_SUBMITTED). */
export function canApplicantSubmitDeclaration(form: DeclarationForm): boolean {
  return form.madeAvailableAt !== null && form.submittedFileUrl === null;
}
export function expectsPreliminaryDeclaration(form: DeclarationForm, m3: { status: string }): boolean {
  return canApplicantSubmitDeclaration(form) && m3.status === 'open';
}

// ── M4 letter and pieces ───────────────────────────────────────────────────
export function canApplicantSubmitLetter(phase: { status: string }, existingLetter: unknown | null): boolean {
  return phase.status === 'open' && existingLetter === null;
}
export function expectsFormalLetter(phase: { status: string }, existingLetter: unknown | null): boolean {
  return canApplicantSubmitLetter(phase, existingLetter);
}

/** An M4 piece still expected from the applicant - the definition the closure
 *  gate (DOCUMENTS_INCOMPLETE) enforces. All 11 slots are mandatory today: any
 *  future optionality rule belongs here only. */
export function isFormalDocumentMissing(doc: { status: string }): boolean {
  return doc.status === 'missing';
}
export function missingFormalDocumentCount(docs: ReadonlyArray<{ status: string }>): number {
  return docs.filter(isFormalDocumentMissing).length;
}
export function canApplicantSubmitFormalDocument(phase: { status: string }, doc: { status: string }): boolean {
  return phase.status === 'open' && isFormalDocumentMissing(doc);
}
/** D4 - from the moment M4 opens, no letter-return gate. */
export function expectsFormalDocuments(phase: { status: string }, docs: ReadonlyArray<{ status: string }>): boolean {
  return phase.status === 'open' && missingFormalDocumentCount(docs) > 0;
}

// ── Payments (M5 / M6 / M7) ────────────────────────────────────────────────
interface PaymentState {
  status: string;
  invoiceFileUrl: string | null;
}
/** The route accepts a proof: a pending one may still be replaced. */
export function canApplicantUploadProof(payment: PaymentState): boolean {
  return payment.invoiceFileUrl !== null && payment.status !== 'validated';
}
/** D11 - expected only while awaiting a proof; rejection_reason never decides. */
export function expectsPaymentProof(payment: PaymentState): boolean {
  return payment.invoiceFileUrl !== null && payment.status === 'awaiting_proof';
}

// ── M5 corrections ─────────────────────────────────────────────────────────
export function canApplicantResubmit(evaluation: { verdict: string | null }): boolean {
  return evaluation.verdict === 'rejected' || evaluation.verdict === 'needs_correction';
}
export function expectsDocumentCorrection(
  m5: { status: string },
  evaluations: ReadonlyArray<{ verdict: string | null }>
): boolean {
  return m5.status === 'open' && evaluations.some(canApplicantResubmit);
}

// ── M7 collection (physical) ───────────────────────────────────────────────
export function expectsCertificateCollection(certificate: { status: string }): boolean {
  return certificate.status === 'notified';
}
