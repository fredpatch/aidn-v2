import type { InspectionActionKey, InspectionBucket, OperationalQueue, OperationalQueueItem } from '@aidn/shared';

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

export interface InspectionQueueItem extends OperationalQueueItem<InspectionBucket, InspectionActionKey> {
  phaseId: number;
  phaseStatus: string;
  requestType: string;
  payment: PaymentView | null;
  siteVisit: SiteVisitView;
  inspection: InspectionView | null;
  /** D11/D14 - the services act only for the assigned agent. */
  assignedToViewer: boolean;
  assignedAgentName: string | null;
}
export type InspectionQueueResponse = OperationalQueue<InspectionQueueItem, InspectionBucket>;
