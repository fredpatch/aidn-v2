export interface PaymentView {
  id: number;
  status: string;
  invoiceFileUrl: string | null;
  invoiceUploadedAt: Date | null;
  proofFileUrl: string | null;
  proofUploadedAt: Date | null;
  validatedAt: Date | null;
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
  evaluatedAt: Date | null;
  correctionDeadline: Date | null;
  resubmittedFileUrl: string | null;
  resubmittedAt: Date | null;
}

export interface DeepEvaluationBundle {
  phase: {
    id: number;
    status: string;
    openedAt: Date;
    closedAt: Date | null;
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

export interface PaymentQueueItem {
  phaseId: number;
  requestId: number;
  requestReference: string;
  requestType: string;
  organisationName: string;
  payment: PaymentView;
  nextAction: 'send_invoice' | 'validate_payment' | 'waiting_for_proof' | 'done' | 'rejected';
}
