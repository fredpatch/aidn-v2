import type { DnCircuitActionKey, DnCircuitBucket, OperationalQueue, OperationalQueueItem } from '@aidn/shared';

export type DnAnnotationAction = 'send_to_director' | 'upload_annotated_return';

export interface DnAnnotationTask extends OperationalQueueItem<DnCircuitBucket, DnCircuitActionKey> {
  requestType: string;
  applicantName: string;
  circuitDocumentId: number;
  fileUrl: string | null;
  mimeType: string | null;
  createdAt: string;
  sentToDirectorAt: string | null;
  returnedAt: string | null;
  availableActions: DnAnnotationAction[];
  /** Whole working days since the hand-over (informational only, no alert). */
  directorWorkingDays: number | null;
  /** Returned without any document: the dossier predates this step. */
  predatesProcess: boolean;
}

export type DnAnnotationListResponse = OperationalQueue<DnAnnotationTask, DnCircuitBucket>;
