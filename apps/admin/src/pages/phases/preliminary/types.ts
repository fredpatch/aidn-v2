export type {
  MeetingStatus,
  PhaseView,
  MeetingView,
  EvaluationView,
  PreliminaryBundle,
  UploadedFile,
} from '../../../lib/api/preliminary.types';

export interface ChecklistItem {
  label: string;
  done: boolean;
  optional?: boolean;
}
