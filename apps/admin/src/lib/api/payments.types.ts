import type { FinanceActionKey, FinanceBucket, OperationalQueue, OperationalQueueItem } from '@aidn/shared';

export interface FinancePaymentView {
  id: number;
  status: string;
  invoiceFileUrl: string | null;
  invoiceUploadedAt: string | null;
  proofFileUrl: string | null;
  proofUploadedAt: string | null;
  validatedAt: string | null;
  rejectionReason: string | null;
  rejectionAction: string | null;
}

/** Mirrors the API's FinanceQueueItem; dates are ISO strings over JSON. */
export interface FinanceQueueItem extends OperationalQueueItem<FinanceBucket, FinanceActionKey> {
  phaseId: number;
  phaseCode: 'M5' | 'M6' | 'M7';
  requestType: string;
  phaseOpenedAt: string;
  payment: FinancePaymentView;
  /** Awaiting a new proof after a « request_new_proof » rejection. */
  newProofRequested: boolean;
}

export type FinanceQueueResponse = OperationalQueue<FinanceQueueItem, FinanceBucket>;
