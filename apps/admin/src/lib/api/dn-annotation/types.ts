export type DnAnnotationBucket = 'to_send' | 'with_director' | 'returned';

export type DnAnnotationAction = 'send_to_director' | 'upload_annotated_return';

export interface DnAnnotationTask {
  id: string;
  bucket: DnAnnotationBucket;
  requestId: number;
  requestReference: string;
  requestType: string;
  organisationName: string;
  applicantName: string;
  circuitDocumentId: number;
  /** Business label from the API (« À transmettre au Directeur DN »...). */
  statusLabel: string;
  fileUrl: string | null;
  mimeType: string | null;
  createdAt: string;
  sentToDirectorAt: string | null;
  returnedAt: string | null;
  availableActions: DnAnnotationAction[];
  dossierStatus: string;
  dossierClosed: boolean;
  /** Whole working days since the hand-over (measured only, no alert yet). */
  directorWorkingDays: number | null;
  /** Returned without any document: the dossier predates this step. */
  predatesProcess: boolean;
}

export interface DnAnnotationListResponse {
  items: DnAnnotationTask[];
  counts: { toSend: number; withDirector: number; returned: number };
}
