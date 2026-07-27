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

export interface SiteVisitView {
  id: number;
  r3AgentId: number;
  scheduledAt: string;
  location: string | null;
  status: string;
}

export interface InspectionView {
  id: number;
  r3AgentId: number;
  verdict: 'compliant' | 'non_compliant' | 'compliant_with_reserves';
  note: string;
  submittedAt: string;
}

export interface SiteInspectionBundle {
  phase: {
    id: number;
    status: string;
    openedAt: string;
    closedAt: string | null;
  } | null;
  payment: PaymentView | null;
  siteVisit: SiteVisitView | null;
  inspection: InspectionView | null;
}

export interface MyQueueItem {
  phaseId: number;
  requestId: number;
  requestReference: string;
  organisationName: string;
  siteVisit: SiteVisitView | null;
}

export interface UploadedFile {
  fileUrl: string;
  mimeType: string;
  uploadAssetId?: number;
}
