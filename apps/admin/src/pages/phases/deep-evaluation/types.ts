export type {
  PaymentView,
  DocumentEvaluationView,
  DeepEvaluationBundle,
  UploadedFile,
} from '../../../lib/api/deep-evaluation.types';

export interface ChecklistItem {
  label: string;
  done: boolean;
  optional?: boolean;
}
