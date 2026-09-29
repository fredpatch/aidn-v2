export type {
  FormalDocumentView,
  FormalLetterCircuitView,
  FormalMeetingView,
  FormalPhaseView,
  FormalPhaseBundle,
} from '../../../lib/api/formal.types';

export interface ChecklistItem {
  label: string;
  done: boolean;
  optional?: boolean;
}
