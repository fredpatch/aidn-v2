/** ROLE-ANALYTICS-1C - Assistante DN role analytics (assistant_dn, SU).
 *
 *  History (Circuit Directeur DN rows, audit actor):
 *  - dn_circuit.sent_to_director: signature_sent_at in the period;
 *  - dn_circuit.return_recorded: pending_review_at in the period, on a row that
 *    was sent. Grandfathered dossiers (backfilled straight to pending_review,
 *    never sent) are not returns;
 *  - dn_circuit.average_director_duration (service only): signature_sent_at ->
 *    pending_review_at, completed in the period;
 *  - dn_circuit.average_handoff_delay (service only): intake DG return
 *    (signed_at) -> hand-over to the Directeur DN (signature_sent_at), the
 *    hand-over in the period.
 *  Both durations are informational: there is no Directeur DN SLA (D10), so
 *  no threshold and no warning / danger severity. Current state (service
 *  only) comes from the Circuit Directeur DN queue. */
import type { RoleAnalyticsOverview, RoleAnalyticsWarning } from '@aidn/shared';
import { DN_CIRCUIT_ENTITY_TYPE, listDnAnnotationTasks } from '../../dn-annotation/dn-annotation.service.js';
import type { RoleAnalyticsContext, RoleAnalyticsProvider } from '../role-analytics.service.js';
import {
  averageCircuitDuration,
  averageDgReturnToDirectorDelay,
  listCircuitEvents,
  type CircuitEventSpec,
} from './circuit-events.js';
import {
  RECENT_ACTIVITY_LIMIT,
  currentCountMetric,
  durationMetric,
  eventCountMetric,
  queueWarning,
  rangeOf,
} from './provider-kit.js';

const ENTITY_TYPES = [DN_CIRCUIT_ENTITY_TYPE] as const;
const SENT: CircuitEventSpec = { event: 'dn_circuit.sent_to_director', entityTypes: ENTITY_TYPES, at: 'signature_sent_at' };
const RETURNED: CircuitEventSpec = {
  event: 'dn_circuit.return_recorded',
  entityTypes: ENTITY_TYPES,
  at: 'pending_review_at',
  requireSent: true,
};

const cockpitHref = (tab: string, itemId: string) => `/circuit-directeur-dn?tab=${tab}&id=${itemId}`;

async function getOverview(context: RoleAnalyticsContext): Promise<RoleAnalyticsOverview> {
  const range = rangeOf(context.period);
  const actorId = context.scope === 'mine' ? context.viewer.userId : null;
  const [sent, returned, recentActivity] = await Promise.all([
    eventCountMetric('dn_circuit.sent_to_director', SENT, range, actorId),
    eventCountMetric('dn_circuit.return_recorded', RETURNED, range, actorId),
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

  const [director, handoff, queue] = await Promise.all([
    averageCircuitDuration(ENTITY_TYPES, 'signature_sent_at', 'pending_review_at', range),
    averageDgReturnToDirectorDelay(range),
    listDnAnnotationTasks({}),
  ]);
  const withDirector = queue.items.filter((item) => item.bucket === 'with_director');
  overview.metrics.push(
    // One row per Directeur DN circuit returned in the period.
    durationMetric('dn_circuit.average_director_duration', director, {
      singular: 'circuit Directeur DN terminé',
      plural: 'circuits Directeur DN terminés',
    }),
    // One row per hand-over to the Directeur DN made in the period.
    durationMetric('dn_circuit.average_handoff_delay', handoff, {
      singular: 'transmission au Directeur DN',
      plural: 'transmissions au Directeur DN',
    }),
    currentCountMetric('dn_circuit.with_director', queue.counts.with_director)
  );
  overview.warnings = [
    queueWarning('dn_circuit.with_director_oldest', 'info', withDirector, (oldest) => cockpitHref('with_director', oldest.id)),
  ].filter((warning): warning is RoleAnalyticsWarning => warning !== null);
  return overview;
}

export const dnCircuitAnalyticsProvider: RoleAnalyticsProvider = { getOverview };
