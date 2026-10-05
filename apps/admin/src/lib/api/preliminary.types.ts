export type MeetingStatus = 'scheduled' | 'held' | 'no_show' | 'rescheduled' | 'file_cancelled';

export interface PhaseView {
  id: number;
  status: 'open' | 'closed' | string;
  openedAt: string;
  closedAt: string | null;
}

export interface MeetingView {
  id: number;
  scheduledAt: string;
  location: string | null;
  status: MeetingStatus | string;
  crDocumentUrl: string | null;
  crUploadedAt: string | null;
}

export interface EvaluationView {
  id: number;
  templateFileUrl: string | null;
  madeAvailableAt: string | null;
  returnDeadline: string | null;
  submittedFileUrl: string | null;
  submittedAt: string | null;
}

export type PreliminaryCircuitStatus = 'submitted' | 'in_signature_circuit' | 'signed' | 'pending_review';

export interface PreliminaryCircuitView {
  status: PreliminaryCircuitStatus | string;
  fileUrl: string | null;
  signatureSentAt: string | null;
  signedAt: string | null;
  pendingReviewAt: string | null;
}

export interface PreliminaryBundle {
  phase: PhaseView | null;
  meeting: MeetingView | null;
  evaluation: EvaluationView | null;
  circuit: PreliminaryCircuitView | null;
}

