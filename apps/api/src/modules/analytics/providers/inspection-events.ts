/** ROLE-ANALYTICS-1E - Cellule Inspection history for the role analytics
 *  (M6 site visits). The assigned CI agent is meetings.dn_agent_id (the
 *  generic column holds the r3_agent for a site visit).
 *
 *  - Planned visits: site_visit rows by scheduled_at, superseded slots
 *    (status 'rescheduled', replaced by a new row) left out. Workload, not
 *    work done. Mine = assigned agent.
 *  - Visits recorded held: SITE_VISIT_HELD audit rows, written only by
 *    markAssignedSiteVisitHeld (the generic meeting status refuses site
 *    visits since BUG-MEETING-SITE-VISIT-STATUS-1). created_at is when the
 *    system recorded the visit as held, not when it physically took place:
 *    there is no meetings.heldAt (1E decision: no migration). MEETING_HELD
 *    rows written on site visits by the old generic route are not counted.
 *  - Opinions: one site_inspections row per M6 phase. Time = the M6 closure
 *    (phases.closed_at, app-written by submitInspectionVerdict; a closed M6
 *    takes no verdict, so the closure of a phase with an opinion is that
 *    submission), not site_inspections.submitted_at (DB default, offset in
 *    pre-UTC history). Actor = site_inspections.r3_agent_id. */
import { sql, type SQL } from 'drizzle-orm';
import type { RoleAnalyticsActivity, RoleAnalyticsEventKey } from '@aidn/shared';
import { db } from '../../../shared/db/index.js';
import { auditEntityKind } from '../../auth/audit-request.js';
import { actionsFor } from '../audit-events.js';
import { epochMs, list, within, type TimeRange } from './sql.js';

/** Stored values of inspection_verdict (schema.ts), reported as they are. */
export const INSPECTION_VERDICTS = ['compliant', 'compliant_with_reserves', 'non_compliant'] as const;
export type InspectionVerdict = (typeof INSPECTION_VERDICTS)[number];

function heldActions(): string[] {
  const actions = actionsFor('inspection.visit_held');
  if (actions.some((action) => auditEntityKind(action) !== 'meeting')) {
    throw new Error('audit actions of inspection.visit_held must name a meeting');
  }
  return actions;
}

const SITE_VISIT = sql`m.meeting_type = 'site_visit'`;

function plannedSource(range: TimeRange, actorId: number | null): SQL {
  return sql`FROM meetings m
    WHERE ${SITE_VISIT} AND m.status <> 'rescheduled'
      AND ${within(sql`m.scheduled_at`, range)}
      ${actorId === null ? sql`` : sql`AND m.dn_agent_id = ${actorId}`}`;
}

function heldSource(range: TimeRange, actorId: number | null): SQL {
  return sql`FROM audit_logs al
    JOIN meetings m ON m.id = al.entity_id AND ${SITE_VISIT}
    JOIN phases ph ON ph.id = m.phase_id
    WHERE al.action IN (${list(heldActions())})
      AND ${within(sql`al.created_at`, range)}
      ${actorId === null ? sql`` : sql`AND al.user_id = ${actorId}`}`;
}

function opinionSource(range: TimeRange, actorId: number | null): SQL {
  return sql`FROM site_inspections si
    JOIN phases ph ON ph.id = si.phase_id AND ph.phase_code = 'M6'
    WHERE ${within(sql`ph.closed_at`, range)}
      ${actorId === null ? sql`` : sql`AND si.r3_agent_id = ${actorId}`}`;
}

async function count(source: SQL): Promise<number> {
  const result = await db.execute<{ count: number }>(sql`SELECT count(*)::int AS count ${source}`);
  return result.rows[0]?.count ?? 0;
}

export const countPlannedVisits = (range: TimeRange, actorId: number | null) => count(plannedSource(range, actorId));
export const countVisitsRecordedHeld = (range: TimeRange, actorId: number | null) => count(heldSource(range, actorId));
export const countOpinions = (range: TimeRange, actorId: number | null) => count(opinionSource(range, actorId));

export async function countOpinionsByVerdict(range: TimeRange, actorId: number | null): Promise<Record<InspectionVerdict, number>> {
  const result = await db.execute<{ verdict: InspectionVerdict; count: number }>(
    sql`SELECT si.verdict::text AS verdict, count(*)::int AS count ${opinionSource(range, actorId)} GROUP BY si.verdict`
  );
  const counts = { compliant: 0, compliant_with_reserves: 0, non_compliant: 0 };
  for (const row of result.rows) counts[row.verdict] = row.count;
  return counts;
}

/** CI events only (held, opinion), newest first, at most `limit`, in one
 *  query. Scheduling is DN work and never listed. */
export async function listInspectionActivity(
  range: TimeRange,
  actorId: number | null,
  limit: number
): Promise<RoleAnalyticsActivity[]> {
  const result = await db.execute<{
    event_key: RoleAnalyticsEventKey;
    at_ms: number;
    actor_id: number | null;
    request_id: number;
    meeting_id: number;
    reference: string;
    full_name: string | null;
  }>(sql`SELECT e.*, r.reference, u.full_name
    FROM (
      SELECT 'inspection.visit_held'::text AS event_key, ${epochMs(sql`al.created_at`)} AS at_ms,
        al.user_id AS actor_id, ph.request_id, m.id AS meeting_id
      ${heldSource(range, actorId)}
      UNION ALL
      SELECT 'inspection.verdict_submitted'::text, ${epochMs(sql`ph.closed_at`)},
        si.r3_agent_id, ph.request_id, si.meeting_id
      ${opinionSource(range, actorId)}
    ) e
    JOIN requests r ON r.id = e.request_id
    LEFT JOIN users u ON u.id = e.actor_id
    ORDER BY e.at_ms DESC, e.meeting_id DESC, e.event_key
    LIMIT ${limit}`);
  return result.rows.map((row) => ({
    at: new Date(Number(row.at_ms)).toISOString(),
    eventKey: row.event_key,
    actor: row.actor_id === null ? null : { kind: 'staff' as const, userId: row.actor_id, fullName: row.full_name ?? '' },
    requestId: row.request_id,
    requestReference: row.reference,
    href: `/mes-inspections?tab=all&id=site_visit:${row.meeting_id}`,
  }));
}
