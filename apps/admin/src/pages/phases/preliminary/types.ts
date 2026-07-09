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

export interface PreliminaryBundle {
  phase: PhaseView | null;
  meeting: MeetingView | null;
  evaluation: EvaluationView | null;
}

export interface ChecklistItem {
  label: string;
  done: boolean;
  optional?: boolean;
}

export interface UploadedFile {
  fileUrl: string;
  mimeType: string;
}
