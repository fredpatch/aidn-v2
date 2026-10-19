/** ROLE-ANALYTICS-1C - historical circuit events for the role analytics.
 *
 *  An event is a dg_circuit_documents row whose business timestamp column
 *  (signature_sent_at, signed_at, pending_review_at) falls in the period: the
 *  row says WHEN, never the audit. The audit says WHO: the actor is the
 *  latest audit row of the event's catalogued actions (current and legacy)
 *  for that circuit. Each send / return overwrites the row's timestamp, so the
 *  latest catalogued audit is the one that wrote it. Correlation by the
 *  action's audited entity (modules/auth/audit-request.ts):
 *  - 'circuit' actions: audit entity_id = circuit id;
 *  - 'request' actions (legacy M1 route: DG_CIRCUIT_SENT_TO_SIGNATURE,
 *    DG_CIRCUIT_SIGNED, DG_CIRCUIT_SIGNED_RETURNED): audit entity_id =
 *    request id, intake circuit only (one per request, unique index).
 *  One row per circuit and event, however many aliases were audited: never
 *  double counted. A row without a correlated audit counts for the service,
 *  for nobody's `mine`, and shows no actor.
 *
 *  Queries are bounded by the period and the entity types (no table load);
 *  timestamps leave PostgreSQL as epoch milliseconds, read as UTC whatever the
 *  driver's local parsing of `timestamp` columns. */
import { sql, type SQL } from 'drizzle-orm';
import type { RoleAnalyticsActivity, RoleAnalyticsEventKey } from '@aidn/shared';
import { db } from '../../../shared/db/index.js';
import { auditEntityKind } from '../../auth/audit-request.js';
import { actionsFor } from '../audit-events.js';
import { averageDays, epochMs, list, utc, type DurationSample, type TimeRange } from './sql.js';

export type CircuitTimestamp = 'signature_sent_at' | 'signed_at' | 'pending_review_at';

export interface CircuitEventSpec {
  event: RoleAnalyticsEventKey;
  entityTypes: readonly string[];
  /** Business time of the event. */
  at: CircuitTimestamp;
  /** The row must have been sent (signature_sent_at set): a return recorded
   *  on a circuit that never went out (grandfathered rows) is not an event. */
  requireSent?: boolean;
}

const column = (name: CircuitTimestamp): SQL => sql.raw(`c.${name}`);

/** Actions of `event` split by the entity their audit row names. */
function correlatedActions(event: RoleAnalyticsEventKey): { circuit: string[]; request: string[] } {
  const actions = actionsFor(event);
  const circuit = actions.filter((action) => auditEntityKind(action) === 'circuit');
  const request = actions.filter((action) => auditEntityKind(action) === 'request');
  if (circuit.length + request.length !== actions.length) {
    throw new Error(`audit actions of ${event} must name a circuit or a request`);
  }
  return { circuit, request };
}

/** LATERAL subquery: the actor (user_id) of the latest correlated audit row. */
function actorLateral(event: RoleAnalyticsEventKey): SQL {
  const { circuit, request } = correlatedActions(event);
  const matches: SQL[] = [];
  if (circuit.length) matches.push(sql`(al.action IN (${list(circuit)}) AND al.entity_id = c.id)`);
  if (request.length) {
    matches.push(sql`(al.action IN (${list(request)}) AND c.entity_type = 'intake_request' AND al.entity_id = c.request_id)`);
  }
  // request_id narrows through audit_logs_request_created_idx: logAudit
  // resolves it for every circuit / request action, and migration 0005
  // backfilled all the catalogued ones. The entity match stays the rule.
  return sql`LEFT JOIN LATERAL (
    SELECT al.user_id FROM audit_logs al
    WHERE al.request_id = c.request_id AND (${sql.join(matches, sql` OR `)})
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT 1
  ) actor ON true`;
}

/** FROM + WHERE of one event in `range`, restricted to `actorId` when given. */
function eventSource(spec: CircuitEventSpec, range: TimeRange, actorId: number | null): SQL {
  const at = column(spec.at);
  return sql`FROM dg_circuit_documents c
    ${actorLateral(spec.event)}
    WHERE c.entity_type IN (${list(spec.entityTypes)})
      AND ${at} >= ${utc(range.start)} AND ${at} < ${utc(range.end)}
      ${spec.requireSent ? sql`AND c.signature_sent_at IS NOT NULL` : sql``}
      ${actorId === null ? sql`` : sql`AND actor.user_id = ${actorId}`}`;
}

export async function countCircuitEvents(spec: CircuitEventSpec, range: TimeRange, actorId: number | null): Promise<number> {
  const result = await db.execute<{ count: number }>(sql`SELECT count(*)::int AS count ${eventSource(spec, range, actorId)}`);
  return result.rows[0]?.count ?? 0;
}

/** Newest first, at most `limit`, across `specs`; one query (request
 *  reference and actor name joined, no per-row lookup). */
export async function listCircuitEvents(
  specs: readonly CircuitEventSpec[],
  range: TimeRange,
  actorId: number | null,
  limit: number,
  href: (row: { entityType: string; requestId: number }) => string
): Promise<RoleAnalyticsActivity[]> {
  const parts = specs.map(
    (spec) => sql`SELECT ${spec.event}::text AS event_key, ${epochMs(column(spec.at))} AS at_ms,
      c.request_id, c.entity_type::text AS entity_type, actor.user_id AS actor_id
      ${eventSource(spec, range, actorId)}`
  );
  const result = await db.execute<{
    event_key: RoleAnalyticsEventKey;
    at_ms: number;
    request_id: number;
    entity_type: string;
    actor_id: number | null;
    reference: string;
    full_name: string | null;
  }>(sql`SELECT e.*, r.reference, u.full_name
    FROM (${sql.join(parts, sql` UNION ALL `)}) e
    JOIN requests r ON r.id = e.request_id
    LEFT JOIN users u ON u.id = e.actor_id
    ORDER BY e.at_ms DESC, e.request_id DESC, e.event_key
    LIMIT ${limit}`);
  return result.rows.map((row) => ({
    at: new Date(Number(row.at_ms)).toISOString(),
    eventKey: row.event_key,
    actor: row.actor_id === null ? null : { kind: 'staff' as const, userId: row.actor_id, fullName: row.full_name ?? '' },
    requestId: row.request_id,
    requestReference: row.reference,
    href: href({ entityType: row.entity_type, requestId: row.request_id }),
  }));
}

/** Mean `from` -> `to` of one circuit, completed in the period (`to` in
 *  range). Missing `from` or negative durations are left out of the sample. */
export function averageCircuitDuration(
  entityTypes: readonly string[],
  from: CircuitTimestamp,
  to: CircuitTimestamp,
  range: TimeRange
): Promise<DurationSample> {
  const end = column(to);
  return averageDays(
    sql`FROM dg_circuit_documents c
      WHERE c.entity_type IN (${list(entityTypes)}) AND ${end} >= ${utc(range.start)} AND ${end} < ${utc(range.end)}`,
    column(from),
    end
  );
}

/** Mean intake DG return (intake signed_at) -> hand-over to the Directeur DN
 *  (DN circuit signature_sent_at) per dossier, the hand-over in the period. */
export function averageDgReturnToDirectorDelay(range: TimeRange): Promise<DurationSample> {
  return averageDays(
    sql`FROM dg_circuit_documents c
      JOIN dg_circuit_documents intake ON intake.request_id = c.request_id AND intake.entity_type = 'intake_request'
      WHERE c.entity_type = 'dn_director_annotation'
        AND c.signature_sent_at >= ${utc(range.start)} AND c.signature_sent_at < ${utc(range.end)}`,
    sql`intake.signed_at`,
    sql`c.signature_sent_at`
  );
}
