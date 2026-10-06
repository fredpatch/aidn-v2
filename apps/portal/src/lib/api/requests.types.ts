export interface RequestView {
  id: number;
  reference: string;
  requestType: string;
  message: string | null;
  status: string;
  rejectionReason: string | null;
  circuitStatus: string | null;
  circuitDocumentUrl: string | null;
  circuitDocumentMimeType: string | null;
  createdAt: string;
}

export interface PreliminaryBundle {
  phase: { id: number; status: string } | null;
  meeting: {
    id: number;
    scheduledAt: string;
    location: string | null;
    status: string;
    crDocumentUrl: string | null;
    crUploadedAt: string | null;
  } | null;
  evaluation: {
    templateFileUrl: string | null;
    madeAvailableAt: string | null;
    returnDeadline: string | null;
    submittedFileUrl: string | null;
    submittedAt: string | null;
  } | null;
}

export interface FormalDoc {
  id: number | null;
  slot: string;
  label: string;
  status: 'missing' | 'submitted';
  fileUrl: string | null;
  submittedAt: string | null;
}

export interface FormalBundle {
  phase: { id: number; status: string } | null;
  letterCircuit: { id: number; status: string; fileUrl: string | null } | null;
  documents: FormalDoc[];
  meeting: {
    id: number;
    scheduledAt: string;
    location: string | null;
    status: string;
    crDocumentUrl: string | null;
  } | null;
  completionRate: number;
}

/** Payment slot shared by M5 / M6 / M7 bundles (status = payment_proof_status). */
export interface PaymentInfo {
  id: number;
  status: string;
  invoiceFileUrl: string | null;
  proofFileUrl: string | null;
  rejectionReason: string | null;
}

export type EvaluationVerdict = 'validated' | 'rejected' | 'needs_correction' | null;

export interface DeepEvaluationBundle {
  phase: { id: number; status: string } | null;
  payment: PaymentInfo | null;
  evaluations: Array<{
    id: number;
    slot: string;
    label: string;
    currentFileUrl: string | null;
    verdict: EvaluationVerdict;
    correctionDeadline: string | null;
  }>;
  completionRate: { total: number; validated: number };
}

export interface SiteInspectionBundle {
  phase: { id: number; status: string } | null;
  payment: PaymentInfo | null;
  siteVisit: {
    id: number;
    scheduledAt: string;
    location: string | null;
    status: string;
  } | null;
}

export interface CertificatesBundle {
  phase: { id: number; status: string } | null;
  payment: PaymentInfo | null;
  certificate: {
    status: string;
    notifiedAt: string | null;
    collectedAt: string | null;
  } | null;
}

export interface SubmitMyRequestInput {
  requestType: string;
  message: string;
  uploadAssetId: number;
}
