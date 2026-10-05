export type {
  MeetingStatus,
  PhaseView,
  MeetingView,
  EvaluationView,
  PreliminaryBundle,
  PreliminaryCircuitView,
  PreliminaryCircuitStatus,
} from '../../../lib/api/preliminary.types';

export interface ChecklistItem {
  label: string;
  done: boolean;
  optional?: boolean;
}
