export type {
  PaymentView,
  DocumentEvaluationView,
  DeepEvaluationBundle,
} from '../../../lib/api/deep-evaluation.types';

export interface ChecklistItem {
  label: string;
  done: boolean;
  optional?: boolean;
}
