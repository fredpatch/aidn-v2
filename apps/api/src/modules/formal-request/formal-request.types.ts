import type { BundleMeeting } from '../meetings/bundle-meeting.js';
export interface FormalDocumentView {
  id: number | null;
  slot: string;
  label: string;
  status: 'missing' | 'submitted';
  fileUrl: string | null;
  submittedAt: Date | null;
  currentVersionUploadedAt: Date | null;
  versionCount: number;
  hasPreviousVersions: boolean;
}

export interface FormalLetterCircuitView {
  id: number;
  status: string;
  fileUrl: string | null;
  signedAt: Date | null;
  pendingReviewAt: Date | null;
  currentVersionUploadedAt: Date | null;
  versionCount: number;
  hasPreviousVersions: boolean;
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
  /** SESSION1-MEET-1 - applicant block or staff negotiation view, by audience. */
  meeting: BundleMeeting | null;
  completionRate: number; // 0-11
}
