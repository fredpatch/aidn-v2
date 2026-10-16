/** ROLE-ANALYTICS-1B - semantic business events -> the audit actions that
 *  record them. Several code paths and older versions used different action
 *  names for the same event; history queries must ask for all of them.
 *  Mappings come from the emitters, not from name similarity:
 *  - courrier.sent_to_dg: courrier cockpit (COURRIER_SENT_TO_SIGNATURE, circuit
 *    id) and the requests route (DG_CIRCUIT_SENT_TO_SIGNATURE, request id);
 *  - courrier.dg_return_recorded: intake return (DG_ANNOTATION_RETURNED),
 *    M3 declaration / M4 letter scan (COURRIER_SIGNED_RETURNED), M4 two-step
 *    "signed" (FORMAL_LETTER_SIGNED); legacy intake DG_CIRCUIT_SIGNED (two-step)
 *    and DG_CIRCUIT_SIGNED_RETURNED (one-step).
 *  Each path emits one action per event, so the lists never double count.
 *
 *  Not catalogued on purpose: FORMAL_LETTER_TRANSMITTED / DG_CIRCUIT_PENDING_REVIEW
 *  (the hand-over to the DN is a separate step only on two-step paths, so a
 *  count would be partial) and MEETING_SCHEDULED / MEETING_HELD /
 *  MEETING_NO_SHOW (shared by every meeting type: the meeting row tells
 *  whether it was a site visit). */
import type { RoleAnalyticsEventKey } from '@aidn/shared';

export interface AuditEventDefinition {
  /** Emitted by the current code. */
  current: readonly string[];
  /** Only in history (no emitter left); still counted. */
  legacy: readonly string[];
  /** Who the audit row names: a staff user, or nobody (applicant action). */
  actor: 'staff' | 'applicant';
}

export const AUDIT_EVENT_CATALOGUE: Record<RoleAnalyticsEventKey, AuditEventDefinition> = {
  'courrier.sent_to_dg': {
    current: ['COURRIER_SENT_TO_SIGNATURE', 'DG_CIRCUIT_SENT_TO_SIGNATURE'],
    legacy: [],
    actor: 'staff',
  },
  'courrier.dg_return_recorded': {
    current: ['DG_ANNOTATION_RETURNED', 'COURRIER_SIGNED_RETURNED', 'FORMAL_LETTER_SIGNED'],
    legacy: ['DG_CIRCUIT_SIGNED', 'DG_CIRCUIT_SIGNED_RETURNED'],
    actor: 'staff',
  },
  'dn_circuit.sent_to_director': { current: ['DN_ANNOTATION_SENT_TO_DIRECTOR'], legacy: [], actor: 'staff' },
  'dn_circuit.return_recorded': { current: ['DN_ANNOTATION_RETURNED'], legacy: [], actor: 'staff' },
  'finance.invoice_uploaded': { current: ['INVOICE_UPLOADED'], legacy: [], actor: 'staff' },
  // The audit row has no applicantId yet (1A gap G4): service counts only.
  'finance.proof_uploaded': { current: ['PAYMENT_PROOF_UPLOADED'], legacy: [], actor: 'applicant' },
  'finance.payment_validated': { current: ['PAYMENT_VALIDATED'], legacy: [], actor: 'staff' },
  'finance.payment_rejected': { current: ['PAYMENT_REJECTED'], legacy: [], actor: 'staff' },
  'inspection.visit_held': { current: ['SITE_VISIT_HELD'], legacy: [], actor: 'staff' },
  'inspection.verdict_submitted': { current: ['INSPECTION_VERDICT_SUBMITTED'], legacy: [], actor: 'staff' },
};

/** Every audit action (current and legacy) recording `event`. */
export function actionsFor(event: RoleAnalyticsEventKey): string[] {
  const definition = AUDIT_EVENT_CATALOGUE[event];
  return [...definition.current, ...definition.legacy];
}

/** The event an audit action records, or null when it is not catalogued. */
export function eventForAction(action: string): RoleAnalyticsEventKey | null {
  for (const [event, definition] of Object.entries(AUDIT_EVENT_CATALOGUE)) {
    if (definition.current.includes(action) || definition.legacy.includes(action)) return event as RoleAnalyticsEventKey;
  }
  return null;
}
