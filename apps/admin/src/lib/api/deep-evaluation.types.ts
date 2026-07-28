export interface PaymentView {
  id: number;
  status: string;
  invoiceFileUrl: string | null;
  invoiceUploadedAt: string | null;
  proofFileUrl: string | null;
  proofUploadedAt: string | null;
  validatedAt: string | null;
  rejectionReason: string | null;
  rejectionAction: string | null;
}

export interface DocumentEvaluationView {
  id: number;
  formalRequestDocumentId: number;
  slot: string;
  label: string;
  currentFileUrl: string | null;
  verdict: 'validated' | 'rejected' | 'needs_correction' | null;
  evaluatedAt: string | null;
  correctionDeadline: string | null;
  resubmittedFileUrl: string | null;
  resubmittedAt: string | null;
}

export interface DeepEvaluationBundle {
  phase: {
    id: number;
    status: string;
    openedAt: string;
    closedAt: string | null;
  } | null;
  payment: PaymentView | null;
  evaluations: DocumentEvaluationView[];
  completionRate: {
    total: number;
    validated: number;
    pending: number;
    needsAction: number;
  };
}

export interface UploadedFile {
  fileUrl: string;
  mimeType: string;
  uploadAssetId?: number;
}

export interface PaymentQueueItem {
  phaseId: number;
  requestId: number;
  requestReference: string;
  requestType: string;
  organisationName: string;
  payment: PaymentView;
  nextAction: 'send_invoice' | 'validate_payment' | 'waiting_for_proof' | 'done' | 'rejected';
}
