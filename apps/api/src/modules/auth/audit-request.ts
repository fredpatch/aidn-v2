import { sql } from 'drizzle-orm';
import type { DbExecutor } from '../../shared/db/index.js';

/**
 * D3a - Which dossier (requests.id) an audit event belongs to.
 *
 * `audit_logs.entity_id` points to a different table depending on the
 * action (request, phase, circuit, payment, meeting...). This map is the one
 * place that says which: `logAudit` resolves `request_id` with it for every
 * new event, and migration 0005 backfills the history with the same lists
 * (an invariant test keeps the two in sync).
 *
 * An action missing from the map stays unlinked (request_id NULL): account,
 * user, auth and system events are not dossier activity.
 */
export type AuditEntityKind =
  | 'request'
  | 'phase'
  | 'circuit'
  | 'certificate'
  | 'payment'
  | 'meeting'
  | 'inspection'
  | 'formal_document'
  | 'document_evaluation'
  | 'preliminary_form';

export const AUDIT_ENTITY_BY_ACTION: Record<string, AuditEntityKind> = {
  REQUEST_SUBMITTED: 'request',
  REQUEST_CANCELLED: 'request',
  REQUEST_COMPLETED: 'request',
  DG_CIRCUIT_DOCUMENT_REPLACED: 'request',
  DG_CIRCUIT_PENDING_REVIEW: 'request',
  DG_CIRCUIT_SENT_TO_SIGNATURE: 'request',
  DG_CIRCUIT_SIGNED: 'request',
  DG_CIRCUIT_SIGNED_RETURNED: 'request',
  DG_CIRCUIT_ALERT_SENT: 'request',
  PHASE_OPENED: 'phase',
  PHASE_CLOSED: 'phase',
  COURRIER_SENT_TO_SIGNATURE: 'circuit',
  COURRIER_SIGNED_RETURNED: 'circuit',
  FORMAL_LETTER_SUBMITTED: 'circuit',
  FORMAL_LETTER_SIGNED: 'circuit',
  FORMAL_LETTER_TRANSMITTED: 'circuit',
  PRELIMINARY_DECLARATION_CIRCUIT_CREATED: 'circuit',
  CERTIFICATE_CREATED: 'certificate',
  CERTIFICATE_DOCUMENT_GENERATED: 'certificate',
  CERTIFICATE_FIELDS_UPDATED: 'certificate',
  CERTIFICATE_SIGNED_RETURN_REGISTERED: 'certificate',
  CERTIFICATE_STATUS_CHANGED: 'certificate',
  CERTIFICATE_TYPE_OVERRIDDEN: 'certificate',
  INVOICE_UPLOADED: 'payment',
  PAYMENT_PROOF_UPLOADED: 'payment',
  PAYMENT_REJECTED: 'payment',
  PAYMENT_VALIDATED: 'payment',
  MEETING_SCHEDULED: 'meeting',
  MEETING_RESCHEDULED: 'meeting',
  MEETING_REPORT_ATTACHED: 'meeting',
  SITE_VISIT_HELD: 'meeting',
  INSPECTION_VERDICT_SUBMITTED: 'inspection',
  FORMAL_DOCUMENT_SUBMITTED: 'formal_document',
  DOCUMENT_VERDICT_SET: 'document_evaluation',
  DOCUMENT_RESUBMITTED: 'document_evaluation',
  PRELIMINARY_EVALUATION_MADE_AVAILABLE: 'preliminary_form',
  PRELIMINARY_EVALUATION_SUBMITTED: 'preliminary_form',
};

/** `MEETING_<STATUS>` (held, absent, file_cancelled...) is built from the
 *  meeting status, so it is matched by prefix. */
export function auditEntityKind(action: string): AuditEntityKind | null {
  return AUDIT_ENTITY_BY_ACTION[action] ?? (action.startsWith('MEETING_') ? 'meeting' : null);
}

/** SQL returning the request id of entity `$id` for each kind. */
const REQUEST_ID_SQL: Record<
  Exclude<AuditEntityKind, 'request'>,
  (id: number) => ReturnType<typeof sql>
> = {
  phase: (id) => sql`select request_id from phases where id = ${id}`,
  circuit: (id) => sql`select request_id from dg_circuit_documents where id = ${id}`,
  certificate: (id) => sql`select request_id from certificates where id = ${id}`,
  payment: (id) =>
    sql`select p.request_id from payments x join phases p on p.id = x.phase_id where x.id = ${id}`,
  meeting: (id) =>
    sql`select p.request_id from meetings x join phases p on p.id = x.phase_id where x.id = ${id}`,
  inspection: (id) =>
    sql`select p.request_id from site_inspections x join phases p on p.id = x.phase_id where x.id = ${id}`,
  formal_document: (id) =>
    sql`select p.request_id from formal_request_documents x join phases p on p.id = x.phase_id where x.id = ${id}`,
  document_evaluation: (id) =>
    sql`select p.request_id from document_evaluations e
        join formal_request_documents x on x.id = e.formal_request_document_id
        join phases p on p.id = x.phase_id where e.id = ${id}`,
  preliminary_form: (id) =>
    sql`select p.request_id from preliminary_evaluation_forms x join phases p on p.id = x.phase_id where x.id = ${id}`,
};

/**
 * Resolution order: an explicit `requestId`, then a numeric
 * `details.requestId`, then the entity lookup (a plain select on the same
 * executor, so inside the caller's transaction). An entity that cannot be
 * found leaves the event unlinked (null) rather than failing the write.
 */
export async function resolveAuditRequestId(
  executor: DbExecutor,
  params: {
    action: string;
    entityId?: number;
    requestId?: number;
    details?: Record<string, unknown>;
  }
): Promise<number | null> {
  if (Number.isInteger(params.requestId)) return params.requestId!;
  const fromDetails = params.details?.requestId;
  if (typeof fromDetails === 'number' && Number.isInteger(fromDetails)) return fromDetails;

  const kind = auditEntityKind(params.action);
  if (!kind || !Number.isInteger(params.entityId)) return null;
  if (kind === 'request') return params.entityId!;
  const result = await executor.execute(REQUEST_ID_SQL[kind](params.entityId!));
  const value = (result.rows[0] as { request_id?: unknown } | undefined)?.request_id;
  return typeof value === 'number' ? value : null;
}
