export const UPLOAD_OWNER_TYPES = [
  'dg_circuit_document',
  'formal_request_document',
  'preliminary_evaluation_form',
  'payment_invoice',
  'payment_proof',
  'document_template',
  'meeting_report',
  'phase_closure_document',
  'certificate_document',
] as const;

export type UploadOwnerType = (typeof UPLOAD_OWNER_TYPES)[number];
