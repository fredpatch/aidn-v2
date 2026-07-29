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

export interface ScopeCategory {
  qualification: string;
  qualificationEn: string;
  limitations: string;
}

export interface ScopeDetails {
  aeronefs: ScopeCategory;
  moteurs: ScopeCategory;
  composants: ScopeCategory;
  specialisee: ScopeCategory;
}

export interface CertificateView {
  id: number;
  reference: string;
  certificateType: 'agreement' | 'recognition';
  typeOverriddenBy: number | null;
  status: string;
  createdAt: string;
  printedAt: string | null;
  signedAt: string | null;
  signedFileUrl: string | null;
  archivedAt: string | null;
  notifiedAt: string | null;
  collectedAt: string | null;
  approvalReferenceNumber: string | null;
  expiresAt: string | null;
  initialIssueDate: string | null;
  currentIssueDate: string | null;
  dgFullNameOverride: string | null;
  scopeDetails: ScopeDetails | null;
  daysToDeliver: number | null;
  daysToCollect: number | null;
}

export interface CertificateBundle {
  phase: {
    id: number;
    status: string;
    openedAt: string;
    closedAt: string | null;
  } | null;
  payment: PaymentView | null;
  certificate: CertificateView | null;
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

export interface UploadedFile {
  fileUrl: string;
  mimeType: string;
  uploadAssetId?: number;
}
