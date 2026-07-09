export type {
  FormalDocumentView,
  FormalLetterCircuitView,
  FormalMeetingView,
  FormalPhaseView,
  FormalPhaseBundle,
  UploadedFile,
} from '../../../lib/api/formal.types';

export interface ChecklistItem {
  label: string;
  done: boolean;
  optional?: boolean;
}
