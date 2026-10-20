/** ROLE-ANALYTICS-1D - Finance role analytics (s5_agent, SU).
 *
 *  History (finance-events.ts):
 *  - finance.payment_validated (+ finance.m5/m6/m7_validated): validated_at,
 *    mine = validated_by; reliable (app-written row fields);
 *  - finance.invoice_uploaded, finance.payment_rejected: audit events (every
 *    re-upload / rejection counts), mine = audit user; caveat
 *    legacy_db_timezone (timed by audit created_at);
 *  - finance.proof_received (service only): applicant proof uploads, audit
 *    events, same caveat; never a staff member's own action;
 *  - finance.average_validation_delay (service only): latest proof upload ->
 *    validation, completed in the period; caveat latest_proof_only (earlier
 *    proofs of a rejection cycle left no timestamp).
 *  Not computed: rejection delay (a rejection cannot be tied to the proof it
 *  refused once a new proof overwrote the timestamp) and an applicant proof
 *  deadline (no parameter exists).
 *  Current state (service only) is read from the Finance queue: buckets,
 *  urgency from the payment-validation parameter, closed dossiers inactive. */
import type { RoleAnalyticsMetric, RoleAnalyticsOverview, RoleAnalyticsWarning } from '@aidn/shared';
import { getFinanceQueue } from '../../payments/finance-queue.js';
import type { RoleAnalyticsContext, RoleAnalyticsProvider } from '../role-analytics.service.js';
import {
  averageValidationDelay,
  countAuditEvents,
  countValidations,
  countValidationsByPhase,
  listFinanceActivity,
} from './finance-events.js';
import {
  AUDIT_TIME_CAVEAT,
  RECENT_ACTIVITY_LIMIT,
  currentCountMetric,
  durationMetric,
  periodCountMetric,
  queueWarning,
  rangeOf,
} from './provider-kit.js';

export const LATEST_PROOF_ONLY_CAVEAT = 'latest_proof_only';

const cockpitHref = (tab: string, itemId: string) => `/paiements-s5?tab=${tab}&id=${itemId}`;

function phaseMetric(key: string, value: number): RoleAnalyticsMetric {
  return { key, value, unit: 'count', basis: 'period', reliability: 'reliable' };
}

async function getOverview(context: RoleAnalyticsContext): Promise<RoleAnalyticsOverview> {
  const range = rangeOf(context.period);
  const actorId = context.scope === 'mine' ? context.viewer.userId : null;
  const [validated, byPhase, invoices, rejected, recentActivity] = await Promise.all([
    periodCountMetric('finance.payment_validated', (r) => countValidations(r, actorId), range),
    countValidationsByPhase(range, actorId),
    periodCountMetric('finance.invoice_uploaded', (r) => countAuditEvents('finance.invoice_uploaded', r, actorId), range, AUDIT_TIME_CAVEAT),
    periodCountMetric('finance.payment_rejected', (r) => countAuditEvents('finance.payment_rejected', r, actorId), range, AUDIT_TIME_CAVEAT),
    listFinanceActivity(range, actorId, RECENT_ACTIVITY_LIMIT),
  ]);
  const overview: RoleAnalyticsOverview = {
    domain: context.domain,
    scope: context.scope,
    period: context.period,
    generatedAt: context.now.toISOString(),
    metrics: [
      validated,
      phaseMetric('finance.m5_validated', byPhase.M5),
      phaseMetric('finance.m6_validated', byPhase.M6),
      phaseMetric('finance.m7_validated', byPhase.M7),
      invoices,
      rejected,
    ],
    warnings: [],
    recentActivity,
  };
  if (context.scope === 'mine') return overview;

  const [proofs, delay, queue] = await Promise.all([
    periodCountMetric('finance.proof_received', (r) => countAuditEvents('finance.proof_uploaded', r, null), range, AUDIT_TIME_CAVEAT),
    averageValidationDelay(range),
    getFinanceQueue(context.now),
  ]);
  const toValidate = queue.items.filter((item) => item.bucket === 'proof_to_validate');
  const overdue = toValidate.filter((item) => item.urgency === 'overdue');
  overview.metrics.push(
    proofs,
    // One row per payment validated in the period.
    durationMetric('finance.average_validation_delay', delay, { singular: 'paiement validé', plural: 'paiements validés' }, LATEST_PROOF_ONLY_CAVEAT),
    currentCountMetric('finance.proof_to_validate', queue.counts.proof_to_validate),
    currentCountMetric('finance.proof_overdue', overdue.length),
    currentCountMetric('finance.invoice_to_send', queue.counts.invoice_to_send)
  );
  overview.warnings = [
    queueWarning('finance.proof_overdue', 'danger', overdue, (oldest) => cockpitHref('proof_to_validate', oldest.id)),
    queueWarning('finance.proof_to_validate_oldest', 'info', toValidate, (oldest) => cockpitHref('proof_to_validate', oldest.id)),
  ].filter((warning): warning is RoleAnalyticsWarning => warning !== null);
  return overview;
}

export const financeAnalyticsProvider: RoleAnalyticsProvider = { getOverview };
