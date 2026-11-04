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

/** WORKFLOW-FOUNDATION-1B - business readiness, computed by the API's
 *  readiness policy (never re-implemented by a client). Only meaningful for
 *  an open phase with no closure courrier yet. */
export interface PhaseClosureReadiness {
  ready: boolean;
  /** The policy's refusal code (MEETING_NOT_RESOLVED, ...) when not ready. */
  blockerCode: string | null;
  /** Its French wording, ready to show. */
  blockerMessage: string | null;
}

/** GET /phase-closures/phases/:phaseId - the closure courrier of a phase and,
 *  while none exists on an open phase, whether one may be deposited. */
export interface PhaseClosureState {
  phaseId: number;
  phaseStatus: 'open' | 'closed';
  closure: PhaseClosureView | null;
  /** null once a courrier exists or the phase is closed. */
  readiness: PhaseClosureReadiness | null;
}
