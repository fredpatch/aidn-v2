import type { CourrierActionKey, CourrierBucket, OperationalQueue, OperationalQueueItem } from '@aidn/shared';

/** WORKFLOW-FOUNDATION-1B - phase_closure: the closure courrier of an M3/M4/M5 phase. */
export type CourrierTaskSource = 'intake_request' | 'formal_request_letter' | 'pre_evaluation' | 'phase_closure';
export type CourrierTaskAction = 'print' | 'confirm_signature_circuit' | 'upload_signed_return';
export type CourrierCircuitStep = 'deposited' | 'with_dg' | 'returned' | 'legacy_signed';

export interface CourrierTask extends OperationalQueueItem<CourrierBucket, CourrierActionKey> {
  source: CourrierTaskSource;
  requestType: string;
  applicantName: string;
  circuitDocumentId: number;
  /** The phase of a closure courrier; null for the other courriers. */
  phaseCode: string | null;
  circuitStatus: string;
  circuitStep: CourrierCircuitStep;
  fileUrl: string | null;
  mimeType: string | null;
  depositedAt: string;
  signatureSentAt: string | null;
  signedAt: string | null;
  pendingReviewAt: string | null;
  availableActions: CourrierTaskAction[];
  signatureWorkingDays: number | null;
  signatureLate: boolean;
}

export interface CourrierTaskListResponse extends OperationalQueue<CourrierTask, CourrierBucket> {
  thresholds: { dgAlertWorkingDays: number; depositDays: number };
}
