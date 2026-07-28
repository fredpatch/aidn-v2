export type CourrierTaskSource = 'intake_request' | 'formal_request_letter';

export type CourrierTaskBucket =
  | 'to_signature'
  | 'in_signature'
  | 'returned'
  | 'legacy_signed';

export type CourrierTaskAction = 'print' | 'confirm_signature_circuit' | 'upload_signed_return';

export interface CourrierTask {
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
  depositedAt: string;
  signatureSentAt: string | null;
  signedAt: string | null;
  pendingReviewAt: string | null;
  availableActions: CourrierTaskAction[];
}

export interface CourrierTaskListResponse {
  items: CourrierTask[];
  counts: {
    toSignature: number;
    inSignature: number;
    returned: number;
    legacySigned: number;
  };
}
