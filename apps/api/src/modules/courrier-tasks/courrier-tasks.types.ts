export type CourrierTaskSource = 'intake_request' | 'formal_request_letter' | 'pre_evaluation';

export type CourrierTaskBucket = 'to_signature' | 'in_signature' | 'returned' | 'legacy_signed';

export type CourrierTaskAction = 'print' | 'confirm_signature_circuit' | 'upload_signed_return';

export interface CourrierTaskView {
  id: string;
  source: CourrierTaskSource;
  bucket: CourrierTaskBucket;
  requestId: number;
  requestReference: string;
  requestType: string;
  organisationName: string;
  applicantName: string;
  circuitDocumentId: number;
  circuitStatus: string;
  fileUrl: string | null;
  mimeType: string | null;
  depositedAt: Date;
  signatureSentAt: Date | null;
  signedAt: Date | null;
  pendingReviewAt: Date | null;
  availableActions: CourrierTaskAction[];
  /** K7c - closed dossier: availableActions is empty. */
  dossierStatus: string;
  dossierClosed: boolean;
  /** C2c - why a pending courrier offers no action although its dossier is
   *  open: its phase (M3 / M4) is not open, so the API would refuse it. */
  actionBlockedReason: 'phase_not_open' | null;
  /** C2c - working days in signature (Libreville, public holidays excluded),
   *  whole days; null outside the signature circuit. */
  signatureWorkingDays: number | null;
  /** C2c - same rule as the Circuit DG alert (`dg_circuit_alert_days`):
   *  in signature for more than the threshold, in working days. */
  signatureLate: boolean;
}

export interface CourrierTaskListResponse {
  items: CourrierTaskView[];
  counts: {
    toSignature: number;
    inSignature: number;
    returned: number;
    legacySigned: number;
  };
  /** C2c - the Circuit DG alert threshold, in working days. */
  signatureAlertDays: number;
}
