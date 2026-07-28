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

export interface SiteVisitView {
  id: number;
  r3AgentId: number;
  scheduledAt: Date;
  location: string | null;
  status: string;
}

export interface InspectionView {
  id: number;
  r3AgentId: number;
  verdict: 'compliant' | 'non_compliant' | 'compliant_with_reserves';
  note: string;
  submittedAt: Date;
}

export interface SiteInspectionBundle {
  phase: {
    id: number;
    status: string;
    openedAt: Date;
    closedAt: Date | null;
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

export interface PaymentQueueItem {
  phaseId: number;
  requestId: number;
  requestReference: string;
  requestType: string;
  organisationName: string;
  payment: PaymentView;
  nextAction: 'send_invoice' | 'validate_payment' | 'waiting_for_proof' | 'done' | 'rejected';
}
