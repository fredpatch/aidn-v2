export interface FormalDocumentView {
  id: number | null;
  slot: string;
  label: string;
  status: 'missing' | 'submitted';
  fileUrl: string | null;
  submittedAt: string | null;
  currentVersionUploadedAt: string | null;
  versionCount: number;
  hasPreviousVersions: boolean;
}

export interface FormalLetterCircuitView {
  id: number;
  status: string;
  fileUrl: string | null;
  signedAt: string | null;
  dnAgentId: number | null;
  currentVersionUploadedAt: string | null;
  versionCount: number;
  hasPreviousVersions: boolean;
}

export interface FormalMeetingView {
  id: number;
  scheduledAt: string;
  location: string | null;
  status: string;
  crDocumentUrl: string | null;
  crUploadedAt: string | null;
}

export interface FormalPhaseView {
  id: number;
  status: string;
  openedAt: string;
  closedAt: string | null;
}

export interface FormalPhaseBundle {
  phase: FormalPhaseView | null;
  letterCircuit: FormalLetterCircuitView | null;
  documents: FormalDocumentView[];
  meeting: FormalMeetingView | null;
  completionRate: number;
}

export interface UploadedFile {
  fileUrl: string;
  mimeType: string;
}
