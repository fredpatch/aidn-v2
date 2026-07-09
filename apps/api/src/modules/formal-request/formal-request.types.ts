export interface FormalDocumentView {
  id: number | null;
  slot: string;
  label: string;
  status: 'missing' | 'submitted';
  fileUrl: string | null;
  submittedAt: Date | null;
}

export interface FormalLetterCircuitView {
  id: number;
  status: string;
  signedAt: Date | null;
  pendingReviewAt: Date | null;
}

export interface FormalPhaseBundle {
  phase: {
    id: number;
    status: string;
    openedAt: Date;
    closedAt: Date | null;
  } | null;
  letterCircuit: FormalLetterCircuitView | null;
  documents: FormalDocumentView[];
  meeting: {
    id: number;
    scheduledAt: Date;
    location: string | null;
    status: string;
    crDocumentUrl: string | null;
    crUploadedAt: Date | null;
  } | null;
  completionRate: number; // 0-11
}
