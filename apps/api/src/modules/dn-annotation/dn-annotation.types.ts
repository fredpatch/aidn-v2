export type DnAnnotationBucket = 'to_send' | 'with_director' | 'returned';

export type DnAnnotationAction = 'send_to_director' | 'upload_annotated_return';

export interface DnAnnotationTaskView {
  /** `dn_director_annotation:<requestId>` - same shape as the courrier task ids. */
  id: string;
  bucket: DnAnnotationBucket;
  requestId: number;
  requestReference: string;
  requestType: string;
  organisationName: string;
  applicantName: string;
  circuitDocumentId: number;
  /** Business label (« À transmettre au Directeur DN »...), never the technical status. */
  statusLabel: string;
  /** Current file of the Directeur DN circuit: the copied DG-annotated
   *  document, then the Directeur DN annotated return. */
  fileUrl: string | null;
  mimeType: string | null;
  /** Task creation = the DG-annotated return was uploaded. */
  createdAt: Date;
  sentToDirectorAt: Date | null;
  returnedAt: Date | null;
  availableActions: DnAnnotationAction[];
  dossierStatus: string;
  dossierClosed: boolean;
  /** Whole working days since the hand-over to the Directeur DN (null otherwise).
   *  Measured only - no automatic alert yet (rule to be validated with DN). */
  directorWorkingDays: number | null;
  /** Returned without any document: the dossier predates this step (grandfathered). */
  predatesProcess: boolean;
}

export interface DnAnnotationListResponse {
  items: DnAnnotationTaskView[];
  counts: { toSend: number; withDirector: number; returned: number };
}
