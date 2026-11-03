/** WORKFLOW-FOUNDATION-1A - the mandatory closure courrier of a phase. A phase
 *  stays open until its courrier has gone through the DG signature circuit
 *  and the signed return is uploaded; business readiness is computed by the
 *  API, never a status here. Mirrors the phase_closure_status DB enum. */

export const PHASE_CLOSURE_STATUSES = ['submitted', 'in_signature_circuit', 'signed_returned'] as const;
export type PhaseClosureStatus = (typeof PHASE_CLOSURE_STATUSES)[number];

/** Read model of a closure circuit. Document fields are file addresses
 *  (/api/files/<id>), never storage paths; dates are ISO strings. */
export interface PhaseClosureView {
  id: number;
  phaseId: number;
  requestId: number;
  status: PhaseClosureStatus;
  draftDocumentUrl: string;
  signedDocumentUrl: string | null;
  submittedAt: string;
  signatureSentAt: string | null;
  signedAt: string | null;
}
