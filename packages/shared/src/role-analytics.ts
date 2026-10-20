/** ROLE-ANALYTICS-1B - role analytics contract ("what happened, how much,
 *  how long, what is overdue"), distinct from the operational cockpits
 *  ("what must I do now"). Semantic keys only: French labels live in the
 *  future /pilotage UI. Durations always state their unit. */
import type { InternalRole } from './statuses.js';

export const ROLE_ANALYTICS_DOMAINS = ['courrier', 'dn_circuit', 'finance', 'inspection'] as const;
export type RoleAnalyticsDomain = (typeof ROLE_ANALYTICS_DOMAINS)[number];

export const ROLE_ANALYTICS_SCOPES = ['mine', 'service'] as const;
export type RoleAnalyticsScope = (typeof ROLE_ANALYTICS_SCOPES)[number];

export const ROLE_ANALYTICS_PRESETS = [
  'today',
  'last_7_days',
  'last_30_days',
  'this_month',
  'previous_month',
  'custom',
] as const;
export type RoleAnalyticsPreset = (typeof ROLE_ANALYTICS_PRESETS)[number];

export type RoleAnalyticsReliability = 'reliable' | 'caveat';
export type RoleAnalyticsUnit = 'count' | 'calendar_days' | 'working_days' | 'percent';

/** Business calendar of every role-analytics period. */
export const ANALYTICS_BUSINESS_TIME_ZONE = 'Africa/Libreville';

export interface RoleAnalyticsPeriod {
  preset: RoleAnalyticsPreset;
  /** Half-open [start, end), ISO-8601 UTC instants. */
  start: string;
  end: string;
  timeZone: typeof ANALYTICS_BUSINESS_TIME_ZONE;
  /** Inclusive Libreville calendar dates (YYYY-MM-DD). */
  displayFrom: string;
  displayTo: string;
}

export interface RoleAnalyticsMetric {
  key: string;
  /** null = not computable (empty sample), never a fabricated zero. */
  value: number | null;
  unit: RoleAnalyticsUnit;
  /** 'period' = within the requested range; 'current' = live queue state. */
  basis: 'period' | 'current';
  sampleSize?: number;
  /** ANALYTICS-SAMPLE-CLARITY-2 - what `sampleSize` counts, in words, built by
   *  the provider that sampled it (« 4 circuits DG terminés »). */
  sampleLabel?: string;
  reliability: RoleAnalyticsReliability;
  caveatKey?: string;
  /** Same-length previous period, for a trend arrow. */
  previousValue?: number | null;
}

export interface RoleAnalyticsWarning {
  key: string;
  severity: 'info' | 'warning' | 'danger';
  count: number;
  oldest?: { requestId: number; requestReference: string; since: string; itemId: string };
  /** Existing cockpit route (tab / ?id= selection); never a new screen, no label. */
  href: string;
}

/** Semantic business events (catalogued against audit actions in the API). */
export const ROLE_ANALYTICS_EVENT_KEYS = [
  'courrier.sent_to_dg',
  'courrier.dg_return_recorded',
  'dn_circuit.sent_to_director',
  'dn_circuit.return_recorded',
  'finance.invoice_uploaded',
  'finance.proof_uploaded',
  'finance.payment_validated',
  'finance.payment_rejected',
  'inspection.visit_held',
  'inspection.verdict_submitted',
] as const;
export type RoleAnalyticsEventKey = (typeof ROLE_ANALYTICS_EVENT_KEYS)[number];

export interface RoleAnalyticsActivity {
  /** ISO-8601 UTC. */
  at: string;
  eventKey: RoleAnalyticsEventKey;
  actor: { kind: 'staff'; userId: number; fullName: string } | { kind: 'applicant' } | null;
  requestId: number | null;
  requestReference: string | null;
  href: string | null;
}

export interface RoleAnalyticsTrendPoint {
  /** ISO-8601 UTC start of a Libreville day or week. */
  bucketStart: string;
  value: number;
}

export interface RoleAnalyticsTrend {
  key: string;
  granularity: 'day' | 'week';
  unit: RoleAnalyticsUnit;
  points: RoleAnalyticsTrendPoint[];
}

export interface RoleAnalyticsOverview {
  domain: RoleAnalyticsDomain;
  scope: RoleAnalyticsScope;
  period: RoleAnalyticsPeriod;
  generatedAt: string;
  metrics: RoleAnalyticsMetric[];
  warnings: RoleAnalyticsWarning[];
  /** Capped, newest first. */
  recentActivity: RoleAnalyticsActivity[];
  trends?: RoleAnalyticsTrend[];
}

/** Who may read which domain and scope. SU `mine` = SU's own actions.
 *  dn_supervisor has no role dashboard (global /analytique only); inspection
 *  `service` stays SU-only (a CI agent sees its own missions, D14). */
export const ROLE_ANALYTICS_ACCESS: Record<RoleAnalyticsDomain, Record<RoleAnalyticsScope, readonly InternalRole[]>> = {
  courrier: { mine: ['reception', 'assistant_dg', 'SU'], service: ['reception', 'assistant_dg', 'SU'] },
  dn_circuit: { mine: ['assistant_dn', 'SU'], service: ['assistant_dn', 'SU'] },
  finance: { mine: ['s5_agent', 'SU'], service: ['s5_agent', 'SU'] },
  inspection: { mine: ['r3_agent', 'SU'], service: ['SU'] },
};

export function isRoleAnalyticsDomain(value: unknown): value is RoleAnalyticsDomain {
  return typeof value === 'string' && (ROLE_ANALYTICS_DOMAINS as readonly string[]).includes(value);
}

export function isRoleAnalyticsScope(value: unknown): value is RoleAnalyticsScope {
  return typeof value === 'string' && (ROLE_ANALYTICS_SCOPES as readonly string[]).includes(value);
}

export function canReadRoleAnalytics(
  roles: readonly string[],
  domain: RoleAnalyticsDomain,
  scope: RoleAnalyticsScope
): boolean {
  const allowed = ROLE_ANALYTICS_ACCESS[domain][scope] as readonly string[];
  return roles.some((role) => allowed.includes(role));
}
