import type { DnCircuitActionKey, DnCircuitBucket, OperationalQueue, OperationalQueueItem } from '@aidn/shared';

export type DnAnnotationAction = 'send_to_director' | 'upload_annotated_return';

export interface DnCircuitQueueItem extends OperationalQueueItem<DnCircuitBucket, DnCircuitActionKey> {
  requestType: string;
  applicantName: string;
  circuitDocumentId: number;
  /** Current file of the Directeur DN circuit: the copied DG-annotated
   *  document, then the Directeur DN annotated return. */
  fileUrl: string | null;
  mimeType: string | null;
  /** Task creation = the DG-annotated return was uploaded. */
  createdAt: Date;
  sentToDirectorAt: Date | null;
  returnedAt: Date | null;
  availableActions: DnAnnotationAction[];
  /** Whole working days since the hand-over (informational only, D10). */
  directorWorkingDays: number | null;
  /** Returned without any document: the dossier predates this step (grandfathered). */
  predatesProcess: boolean;
}

export type DnCircuitQueueResponse = OperationalQueue<DnCircuitQueueItem, DnCircuitBucket>;
/** @deprecated kept for the mutation callers. */
export type DnAnnotationTaskView = DnCircuitQueueItem;
