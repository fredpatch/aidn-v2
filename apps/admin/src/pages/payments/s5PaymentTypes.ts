import type { PaymentQueueItem as DeepPaymentQueueItem } from '../../lib/api/deep-evaluation.types';
import type { PaymentQueueItem as SitePaymentQueueItem } from '../../lib/api/site-inspection.types';
import type { PaymentQueueItem as CertificatePaymentQueueItem } from '../../lib/api/certificates.types';

export type S5PaymentQueueItem = (
  | DeepPaymentQueueItem
  | SitePaymentQueueItem
  | CertificatePaymentQueueItem
) & {
  phaseCode: 'M5' | 'M6' | 'M7';
};
