export type CourrierTaskSource = 'intake_request' | 'formal_request_letter';

export type CourrierTaskBucket =
  | 'to_signature'
  | 'in_signature'
  | 'returned'
  | 'legacy_signed';

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
}

export interface CourrierTaskListResponse {
  items: CourrierTaskView[];
  counts: {
    toSignature: number;
    inSignature: number;
    returned: number;
    legacySigned: number;
  };
}
