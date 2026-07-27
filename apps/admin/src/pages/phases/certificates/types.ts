export type {
  PaymentView,
  CertificateView,
  CertificateBundle,
  ScopeDetails,
  ScopeCategory,
  UploadedFile,
} from '../../../lib/api/certificates.types';
export type { CertificateFieldsInput } from '../../../lib/api/certificates.api';

export interface ChecklistItem {
  label: string;
  done: boolean;
  optional?: boolean;
}
