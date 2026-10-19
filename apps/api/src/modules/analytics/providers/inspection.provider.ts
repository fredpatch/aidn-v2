/** ROLE-ANALYTICS-1E - Cellule Inspection role analytics (r3_agent mine;
 *  SU mine and service - D14: an agent sees only their own missions).
 *
 *  History (inspection-events.ts):
 *  - inspection.visits_planned: assigned visits by scheduled date (workload),
 *    reliable;
 *  - inspection.visit_held_recorded: SITE_VISIT_HELD audit rows, caveat
 *    recorded_time_not_actual_visit_time (the time the system recorded it,
 *    also subject to the pre-UTC audit offset, gotchas #27);
 *  - inspection.opinion_submitted + inspection.verdict_<stored value>: M6
 *    closure time, site_inspections.r3_agent_id, reliable.
 *  Not computed: a visit -> opinion delay (no actual held time), site-visit
 *  no-shows (no path records one since BUG-MEETING-SITE-VISIT-STATUS-1).
 *
 *  Current state from the CI queue (getMyQueue), in both scopes: missions are
 *  assigned to one agent, so `mine` = the viewer's assigned visits, `service`
 *  = every visit (SU). Buckets, payment blocking, closed dossiers and urgency
 *  are the queue's; there is no M6 SLA beyond the visit day. */
import type { RoleAnalyticsMetric, RoleAnalyticsOverview, RoleAnalyticsWarning } from '@aidn/shared';
import { getMyQueue } from '../../site-inspection/site-inspection.service.js';
import type { RoleAnalyticsContext, RoleAnalyticsProvider } from '../role-analytics.service.js';
import {
  INSPECTION_VERDICTS,
  countOpinions,
  countOpinionsByVerdict,
  countPlannedVisits,
  countVisitsRecordedHeld,
  listInspectionActivity,
} from './inspection-events.js';
import { RECENT_ACTIVITY_LIMIT, currentCountMetric, periodCountMetric, queueWarning, rangeOf } from './provider-kit.js';

export const RECORDED_HELD_TIME_CAVEAT = 'recorded_time_not_actual_visit_time';

const cockpitHref = (tab: string, itemId?: string) => `/mes-inspections?tab=${tab}${itemId ? `&id=${itemId}` : ''}`;

function verdictMetric(verdict: string, value: number): RoleAnalyticsMetric {
  return { key: `inspection.verdict_${verdict}`, value, unit: 'count', basis: 'period', reliability: 'reliable' };
}

async function getOverview(context: RoleAnalyticsContext): Promise<RoleAnalyticsOverview> {
  const range = rangeOf(context.period);
  const actorId = context.scope === 'mine' ? context.viewer.userId : null;
  const [planned, held, opinions, verdicts, recentActivity, queue] = await Promise.all([
    periodCountMetric('inspection.visits_planned', (r) => countPlannedVisits(r, actorId), range),
    periodCountMetric('inspection.visit_held_recorded', (r) => countVisitsRecordedHeld(r, actorId), range, RECORDED_HELD_TIME_CAVEAT),
    periodCountMetric('inspection.opinion_submitted', (r) => countOpinions(r, actorId), range),
    countOpinionsByVerdict(range, actorId),
    listInspectionActivity(range, actorId, RECENT_ACTIVITY_LIMIT),
    getMyQueue(context.viewer, context.now),
  ]);

  // SU's queue lists every mission: `mine` keeps the viewer's own (an r3_agent's is already theirs).
  const items = context.scope === 'mine' ? queue.items.filter((item) => item.assignedToViewer) : queue.items;
  const overdue = items.filter((item) => item.bucket === 'to_hold' && item.urgency === 'overdue');
  const blocked = items.filter((item) => item.bucket === 'awaiting_payment');
  const awaitingOpinion = items.filter((item) => item.bucket === 'verdict_due');

  const warnings = [
    queueWarning('inspection.visit_overdue', 'danger', overdue, (oldest) => cockpitHref('to_hold', oldest.id)),
    // Waiting on Finance / the applicant: information, never an agent delay.
    queueWarning('inspection.blocked_by_payment', 'info', blocked, (oldest) => cockpitHref('awaiting_payment', oldest.id)),
    // No `oldest`: the queue's step start for a held visit is its scheduled
    // date, which must not read as the time the visit was held.
    awaitingOpinion.length
      ? { key: 'inspection.awaiting_opinion', severity: 'info' as const, count: awaitingOpinion.length, href: cockpitHref('verdict_due') }
      : null,
  ].filter((warning): warning is RoleAnalyticsWarning => warning !== null);

  return {
    domain: context.domain,
    scope: context.scope,
    period: context.period,
    generatedAt: context.now.toISOString(),
    metrics: [
      planned,
      held,
      opinions,
      ...INSPECTION_VERDICTS.map((verdict) => verdictMetric(verdict, verdicts[verdict])),
      currentCountMetric('inspection.visit_overdue', overdue.length),
      currentCountMetric('inspection.blocked_by_payment', blocked.length),
      currentCountMetric('inspection.awaiting_opinion', awaitingOpinion.length),
    ],
    warnings,
    recentActivity,
  };
}

export const inspectionAnalyticsProvider: RoleAnalyticsProvider = { getOverview };
