export interface RequestView {
  id: number;
  reference: string;
  requestType: string;
  message: string | null;
  status: string;
  rejectionReason: string | null;
  circuitStatus: string | null;
  createdAt: string;
}

export interface UploadedFile {
  fileUrl: string;
  mimeType: string;
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

export interface SubmitMyRequestInput {
  requestType: string;
  message: string;
  fileUrl: string;
  mimeType: string;
}
