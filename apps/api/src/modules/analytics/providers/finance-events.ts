/** ROLE-ANALYTICS-1D - Finance history for the role analytics (M5 / M6 / M7
 *  payments only).
 *
 *  Two kinds of source, chosen per event:
 *  - validation: the payment row. validated_at / validated_by are written
 *    once, under the row lock, and never rewritten (a validated payment takes
 *    no new invoice or proof): time AND actor are authoritative there. The
 *    PAYMENT_VALIDATED audit row is not read (it would duplicate the event);
 *  - invoice upload, proof upload, rejection: the audit rows. The payment
 *    keeps only the latest invoice / proof timestamp (a re-upload overwrites
 *    it) and the latest rejection fields, so every earlier event survives
 *    only in the audit: each audit row is one event, timed by created_at.
 *    Audit rows name the payment (entity_id, 'payment' kind in
 *    audit-request.ts); the join to payments / phases gives the phase and the
 *    dossier. A proof upload is an applicant action with no actor recorded. */
import { sql, type SQL } from 'drizzle-orm';
import type { RoleAnalyticsActivity, RoleAnalyticsEventKey } from '@aidn/shared';
import { db } from '../../../shared/db/index.js';
import { auditEntityKind } from '../../auth/audit-request.js';
import { AUDIT_EVENT_CATALOGUE, actionsFor } from '../audit-events.js';
import { averageDays, epochMs, list, within, type DurationSample, type TimeRange } from './sql.js';

export const FINANCE_PHASE_CODES = ['M5', 'M6', 'M7'] as const;
export type FinancePhaseCode = (typeof FINANCE_PHASE_CODES)[number];

/** Audit-only Finance events (the validation is read from the row). */
export type FinanceAuditEvent = 'finance.invoice_uploaded' | 'finance.proof_uploaded' | 'finance.payment_rejected';

function paymentActions(event: FinanceAuditEvent): string[] {
  const actions = actionsFor(event);
  if (actions.some((action) => auditEntityKind(action) !== 'payment')) {
    throw new Error(`audit actions of ${event} must name a payment`);
  }
  return actions;
}

const PAYMENT_PHASE = sql`JOIN phases ph ON ph.id = p.phase_id AND ph.phase_code IN (${list(FINANCE_PHASE_CODES)})`;

function validationSource(range: TimeRange, actorId: number | null): SQL {
  return sql`FROM payments p ${PAYMENT_PHASE}
    WHERE ${within(sql`p.validated_at`, range)}
      ${actorId === null ? sql`` : sql`AND p.validated_by = ${actorId}`}`;
}

function auditSource(event: FinanceAuditEvent, range: TimeRange, actorId: number | null): SQL {
  return sql`FROM audit_logs al
    JOIN payments p ON p.id = al.entity_id
    ${PAYMENT_PHASE}
    WHERE al.action IN (${list(paymentActions(event))})
      AND ${within(sql`al.created_at`, range)}
      ${actorId === null ? sql`` : sql`AND al.user_id = ${actorId}`}`;
}

/** Validated payments in the range per phase (missing phase = 0). */
export async function countValidationsByPhase(range: TimeRange, actorId: number | null): Promise<Record<FinancePhaseCode, number>> {
  const result = await db.execute<{ phase_code: FinancePhaseCode; count: number }>(
    sql`SELECT ph.phase_code::text AS phase_code, count(*)::int AS count ${validationSource(range, actorId)} GROUP BY ph.phase_code`
  );
  const counts = { M5: 0, M6: 0, M7: 0 };
  for (const row of result.rows) counts[row.phase_code] = row.count;
  return counts;
}

export async function countValidations(range: TimeRange, actorId: number | null): Promise<number> {
  const result = await db.execute<{ count: number }>(sql`SELECT count(*)::int AS count ${validationSource(range, actorId)}`);
  return result.rows[0]?.count ?? 0;
}

export async function countAuditEvents(event: FinanceAuditEvent, range: TimeRange, actorId: number | null): Promise<number> {
  const result = await db.execute<{ count: number }>(sql`SELECT count(*)::int AS count ${auditSource(event, range, actorId)}`);
  return result.rows[0]?.count ?? 0;
}

/** Latest proof upload -> validation, validation in the range. Only the
 *  proof that was validated has a timestamp left (earlier proofs of a
 *  rejection cycle were overwritten): not the whole payment lifecycle. */
export function averageValidationDelay(range: TimeRange): Promise<DurationSample> {
  return averageDays(sql`${validationSource(range, null)}`, sql`p.proof_uploaded_at`, sql`p.validated_at`);
}

/** Newest first, at most `limit`, in one query (reference, phase and actor
 *  name joined). `actorId` set = that staff member's events only, so the
 *  applicant's proof uploads are left out. */
export async function listFinanceActivity(
  range: TimeRange,
  actorId: number | null,
  limit: number
): Promise<RoleAnalyticsActivity[]> {
  const auditEvents: FinanceAuditEvent[] = ['finance.invoice_uploaded', 'finance.payment_rejected'];
  if (actorId === null) auditEvents.push('finance.proof_uploaded');
  const parts = [
    sql`SELECT 'finance.payment_validated'::text AS event_key, ${epochMs(sql`p.validated_at`)} AS at_ms,
      p.validated_by AS actor_id, false AS by_applicant, ph.request_id, ph.id AS phase_id, ph.phase_code::text AS phase_code
      ${validationSource(range, actorId)}`,
    ...auditEvents.map(
      (event) => sql`SELECT ${event}::text AS event_key, ${epochMs(sql`al.created_at`)} AS at_ms,
        al.user_id AS actor_id, ${AUDIT_EVENT_CATALOGUE[event].actor === 'applicant'}::boolean AS by_applicant,
        ph.request_id, ph.id AS phase_id, ph.phase_code::text AS phase_code
        ${auditSource(event, range, actorId)}`
    ),
  ];
  const result = await db.execute<{
    event_key: RoleAnalyticsEventKey;
    at_ms: number;
    actor_id: number | null;
    by_applicant: boolean;
    request_id: number;
    phase_id: number;
    phase_code: string;
    reference: string;
    full_name: string | null;
  }>(sql`SELECT e.*, r.reference, u.full_name
    FROM (${sql.join(parts, sql` UNION ALL `)}) e
    JOIN requests r ON r.id = e.request_id
    LEFT JOIN users u ON u.id = e.actor_id
    ORDER BY e.at_ms DESC, e.phase_id DESC, e.event_key
    LIMIT ${limit}`);
  return result.rows.map((row) => ({
    at: new Date(Number(row.at_ms)).toISOString(),
    eventKey: row.event_key,
    actor: row.by_applicant
      ? { kind: 'applicant' as const }
      : row.actor_id === null
        ? null
        : { kind: 'staff' as const, userId: row.actor_id, fullName: row.full_name ?? '' },
    requestId: row.request_id,
    requestReference: row.reference,
    href: `/paiements-s5?tab=all&id=${row.phase_code}:${row.phase_id}`,
  }));
}
