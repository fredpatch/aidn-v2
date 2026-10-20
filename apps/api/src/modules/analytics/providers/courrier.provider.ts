/** ROLE-ANALYTICS-1C - Courrier role analytics (reception, assistant_dg, SU).
 *
 *  History (circuit rows of the reception family, audit actor):
 *  - courrier.sent_to_dg: signature_sent_at in the period;
 *  - courrier.dg_return_recorded: signed_at in the period. Every path writes
 *    signed_at at the DG return (intake and M3 / M4 one-step returns, the M4
 *    two-step "signed"); the later hand-over to the DN only writes
 *    pending_review_at, so it is never counted;
 *  - courrier.average_dg_circuit_duration (service only): signature_sent_at ->
 *    signed_at, completed in the period (signed_at in range). A process
 *    duration (time at the DG), not an agent's performance.
 *  Current state (service only) is read from the Courriers queue itself
 *  (bucket, urgency, closed dossiers already `inactive`), never recomputed. */
import type { RoleAnalyticsOverview, RoleAnalyticsWarning } from '@aidn/shared';
import { listCourrierTasks, MANAGED_ENTITY_TYPES } from '../../courrier-tasks/courrier-tasks.service.js';
import type { RoleAnalyticsContext, RoleAnalyticsProvider } from '../role-analytics.service.js';
import { averageCircuitDuration, listCircuitEvents, type CircuitEventSpec } from './circuit-events.js';
import {
  RECENT_ACTIVITY_LIMIT,
  currentCountMetric,
  durationMetric,
  eventCountMetric,
  queueWarning,
  rangeOf,
} from './provider-kit.js';

const SENT: CircuitEventSpec = { event: 'courrier.sent_to_dg', entityTypes: MANAGED_ENTITY_TYPES, at: 'signature_sent_at' };
const RETURNED: CircuitEventSpec = { event: 'courrier.dg_return_recorded', entityTypes: MANAGED_ENTITY_TYPES, at: 'signed_at' };

const cockpitHref = (tab: string, itemId: string) => `/courriers?tab=${tab}&id=${itemId}`;

async function getOverview(context: RoleAnalyticsContext): Promise<RoleAnalyticsOverview> {
  const range = rangeOf(context.period);
  const actorId = context.scope === 'mine' ? context.viewer.userId : null;
  const [sent, returned, recentActivity] = await Promise.all([
    eventCountMetric('courrier.sent_to_dg', SENT, range, actorId),
    eventCountMetric('courrier.dg_return_recorded', RETURNED, range, actorId),
    listCircuitEvents([SENT, RETURNED], range, actorId, RECENT_ACTIVITY_LIMIT, (row) =>
      cockpitHref('all', `${row.entityType}:${row.requestId}`)
    ),
  ]);
  const overview: RoleAnalyticsOverview = {
    domain: context.domain,
    scope: context.scope,
    period: context.period,
    generatedAt: context.now.toISOString(),
    metrics: [sent, returned],
    warnings: [],
    recentActivity,
  };
  if (context.scope === 'mine') return overview;

  const [duration, queue] = await Promise.all([
    averageCircuitDuration(MANAGED_ENTITY_TYPES, 'signature_sent_at', 'signed_at', range),
    listCourrierTasks({}),
  ]);
  const withDg = queue.items.filter((item) => item.bucket === 'with_dg');
  const overdue = withDg.filter((item) => item.urgency === 'overdue');
  overview.metrics.push(
    // One row per DG circuit document signed in the period.
    durationMetric('courrier.average_dg_circuit_duration', duration, { singular: 'circuit DG terminé', plural: 'circuits DG terminés' }),
    currentCountMetric('courrier.to_print_backlog', queue.counts.to_print),
    currentCountMetric('courrier.dg_return_overdue', overdue.length)
  );
  overview.warnings = [
    queueWarning('courrier.dg_return_overdue', 'danger', overdue, (oldest) => cockpitHref('with_dg', oldest.id)),
    queueWarning('courrier.dg_return_oldest', 'info', withDg, (oldest) => cockpitHref('with_dg', oldest.id)),
  ].filter((warning): warning is RoleAnalyticsWarning => warning !== null);
  return overview;
}

export const courrierAnalyticsProvider: RoleAnalyticsProvider = { getOverview };
