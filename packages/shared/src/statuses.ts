/**
 * Status enums locked during the feasibility study
 * (see project/modules-feasibility.md and technical/cross-cutting-patterns.md).
 * Kept here so apps/api, apps/admin and apps/portal share one source of truth.
 */

/** Pattern "Circuit DG" (M1) */
export const REQUEST_STATUSES = ['submitted', 'signed', 'pending_review'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Pattern "Reunion / Visite" (M3, M4, M6) */
export const MEETING_STATUSES = [
  'scheduled',
  'held',
  'no_show',
  'rescheduled',
  'file_cancelled',
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** M3/M4 - blank template forms DN makes available for applicants */
export const DOCUMENT_TEMPLATE_KEYS = [
  'preliminary_evaluation_declaration',
  'dn_air_r2_3_f_e_010',
  'dn_air_r2_3_f_e_011',
  'dn_air_r2_3_f_e_012',
] as const;
export type DocumentTemplateKey = (typeof DOCUMENT_TEMPLATE_KEYS)[number];

/** M5 - per-document evaluation verdict */
export const DOCUMENT_VERDICTS = ['validated', 'rejected', 'needs_correction'] as const;
export type DocumentVerdict = (typeof DOCUMENT_VERDICTS)[number];

/** M6 - R3 site inspection verdict, submitted in one action with a note */
export const INSPECTION_VERDICTS = [
  'compliant',
  'non_compliant',
  'compliant_with_reserves',
] as const;
export type InspectionVerdict = (typeof INSPECTION_VERDICTS)[number];

/** M7 - certificate lifecycle; the phase stays open through this entire cycle
 *  because time-to-deliver is the tracked KPI (see cross-cutting-patterns.md #3) */
export const CERTIFICATE_STATUSES = [
  'in_preparation',
  'printed',
  'signed',
  'archived',
  'notified',
  'collected',
] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

/** M9 - payment proof outcome; rejection can end in a terminal dossier rejection
 *  which releases the "one active request" rule (M1) */
export const PAYMENT_PROOF_STATUSES = ['pending', 'validated', 'rejected'] as const;
export type PaymentProofStatus = (typeof PAYMENT_PROOF_STATUSES)[number];

export const DOSSIER_TERMINAL_STATUSES = ['rejected'] as const;
export type DossierTerminalStatus = (typeof DOSSIER_TERMINAL_STATUSES)[number];

/** M13 - internal roles; multi-role per user is allowed */
export const INTERNAL_ROLES = [
  'reception',
  'assistant_dg',
  'dn_agent',
  'dn_supervisor',
  'r3_agent',
  's5_agent',
  'SU',
] as const;
export type InternalRole = (typeof INTERNAL_ROLES)[number];

/** AUTH - default system parameter keys and fallback values, used when a row
 *  is missing from system_parameters (should not normally happen once seeded) */
export const DEFAULT_OTP_EXPIRATION_MINUTES = 15;
export const DEFAULT_LOCKOUT_MAX_ATTEMPTS = 5;
export const DEFAULT_LOCKOUT_DURATION_MINUTES = 30;
export const DEFAULT_DG_CIRCUIT_ALERT_DAYS = 3;

/** M13 - applicant contact ordering label; permissions are strictly equal
 *  across contacts of the same organisation - this is a contact-order label
 *  only, never an access-control tier */
export const APPLICANT_CONTACT_ORDER = ['primary', 'secondary', 'tertiary'] as const;
export type ApplicantContactOrder = (typeof APPLICANT_CONTACT_ORDER)[number];

/** M8 - accepted upload formats (deliberately not restricted to PDF/Word) */
export const ACCEPTED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
] as const;
