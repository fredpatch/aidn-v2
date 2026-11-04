import type { CourrierActionKey, CourrierBucket, OperationalQueue, OperationalQueueItem } from '@aidn/shared';

/** WORKFLOW-FOUNDATION-1B - phase_closure: the closure courrier of an M3/M4/M5
 *  phase (phase_closure_circuits), printed and returned like the others. */
export type CourrierTaskSource = 'intake_request' | 'formal_request_letter' | 'pre_evaluation' | 'phase_closure';
export type CourrierTaskAction = 'print' | 'confirm_signature_circuit' | 'upload_signed_return';
/** The DG circuit step, for the stepper (the former `bucket` values). */
export type CourrierCircuitStep = 'deposited' | 'with_dg' | 'returned' | 'legacy_signed';

export interface CourrierQueueItem extends OperationalQueueItem<CourrierBucket, CourrierActionKey> {
  source: CourrierTaskSource;
  requestType: string;
  applicantName: string;
  /** dg_circuit_documents.id, or phase_closure_circuits.id for a closure courrier. */
  circuitDocumentId: number;
  /** The phase of a closure courrier (its label is the phase name); null otherwise. */
  phaseCode: string | null;
  circuitStatus: string;
  circuitStep: CourrierCircuitStep;
  fileUrl: string | null;
  mimeType: string | null;
  depositedAt: Date;
  signatureSentAt: Date | null;
  signedAt: Date | null;
  pendingReviewAt: Date | null;
  /** Empty on a closed dossier or a phase that is not open (the API would refuse). */
  availableActions: CourrierTaskAction[];
  /** Whole working days in the DG circuit (null outside it). */
  signatureWorkingDays: number | null;
  /** Exactly the Circuit DG alert job's cutoff. */
  signatureLate: boolean;
}

export interface CourrierQueueResponse extends OperationalQueue<CourrierQueueItem, CourrierBucket> {
  thresholds: { dgAlertWorkingDays: number; depositDays: number };
}

/** @deprecated name kept for the mutation responses' callers. */
export type CourrierTaskView = CourrierQueueItem;
