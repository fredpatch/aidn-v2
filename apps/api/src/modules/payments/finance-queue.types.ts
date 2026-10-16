import type { FinanceActionKey, FinanceBucket, OperationalQueue, OperationalQueueItem } from '@aidn/shared';

export interface FinancePaymentView {
  id: number;
  status: string;
  invoiceFileUrl: string | null;
  invoiceUploadedAt: Date | null;
  proofFileUrl: string | null;
  proofUploadedAt: Date | null;
  validatedAt: Date | null;
  rejectionReason: string | null;
  rejectionAction: string | null;
}

export interface FinanceQueueItem extends OperationalQueueItem<FinanceBucket, FinanceActionKey> {
  phaseId: number;
  phaseCode: 'M5' | 'M6' | 'M7';
  requestType: string;
  phaseOpenedAt: Date;
  payment: FinancePaymentView;
  /** B3 - awaiting a new proof after a « request_new_proof » rejection. */
  newProofRequested: boolean;
}

export type FinanceQueueResponse = OperationalQueue<FinanceQueueItem, FinanceBucket>;
