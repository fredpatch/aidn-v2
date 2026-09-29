export type {
  PaymentView,
  SiteVisitView,
  InspectionView,
  SiteInspectionBundle,
} from '../../../lib/api/site-inspection.types';

export interface ChecklistItem {
  label: string;
  done: boolean;
  optional?: boolean;
}
