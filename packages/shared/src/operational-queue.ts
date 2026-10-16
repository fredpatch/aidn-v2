/**
 * SESSION1-COCKPIT-1 - operational work queues (Réception / Assistant DG,
 * Assistante DN, Finance, Cellule Inspection). The API computes every field;
 * the admin maps the keys to French (D13). Domain fields stay in each domain's
 * item type (R2).
 */
import type { NextActionOwner, OperationalState } from './applicant-actions.js';

export type OperationalUrgency = 'normal' | 'warning' | 'overdue';

/** Sort rank: overdue first. */
export const URGENCY_RANK: Record<OperationalUrgency, number> = { overdue: 0, warning: 1, normal: 2 };

/** Why an item cannot progress; null when it can. */
export type OperationalBlockReason = 'dossier_closed' | 'phase_not_open' | 'payment_not_validated';

export interface OperationalQueueItem<B extends string, K extends string> {
  /** Stable row key, unique within the queue (also the `?id=` value). */
  id: string;
  requestId: number;
  requestReference: string;
  organisationName: string;
  /** Server-computed bucket; the closed and blocked rules are already applied. */
  bucket: B;
  state: OperationalState;
  /** The actor expected to perform the current step; null when done or inactive. */
  owner: NextActionOwner | null;
  actionKey: K;
  blockReason: OperationalBlockReason | null;
  urgency: OperationalUrgency;
  /** ISO time the item reached its current step. */
  stepSince: string | null;
  /** ISO due time, only where a real date exists (a scheduled visit). */
  dueAt: string | null;
  dossierClosed: boolean;
  dossierStatus: string;
}

/** counts has every bucket key; counts.inactive is never read by a metric,
 *  a tab badge or an action count (spec §4). */
export interface OperationalQueue<I, B extends string> {
  items: I[];
  counts: Record<B, number>;
}

/** The existing dashboard rule (slaStatusFromWaitingDays), moved unchanged. */
export function urgencyFromAge(age: number | null, targetDays: number): OperationalUrgency {
  if (age === null) return 'normal';
  if (age > targetDays) return 'overdue';
  if (age >= Math.max(targetDays - 1, 1)) return 'warning';
  return 'normal';
}

/** Frozen CI rule: on the local calendar day, a visit after today is normal,
 *  today is warning, before today is overdue. */
export function visitDayUrgency(scheduledAt: Date, now: Date): OperationalUrgency {
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const visit = day(scheduledAt);
  const today = day(now);
  if (visit < today) return 'overdue';
  if (visit === today) return 'warning';
  return 'normal';
}

export function countBuckets<B extends string>(keys: readonly B[], items: ReadonlyArray<{ bucket: B }>): Record<B, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<B, number>;
  for (const item of items) counts[item.bucket] += 1;
  return counts;
}

/** Single source of the operational owners (UX-1 residual). roles = the
 *  requireRole(...) list of the route performing the step, verbatim. */
export const OPERATIONAL_OWNERS = {
  dn: { kind: 'staff', label: 'DN', roles: ['dn_agent', 'dn_supervisor', 'SU'] },
  reception: { kind: 'staff', label: 'Réception', roles: ['assistant_dg', 'reception', 'SU'] },
  assistantDg: { kind: 'staff', label: 'Assistant DG', roles: ['assistant_dg', 'reception', 'SU'] },
  assistantDn: { kind: 'staff', label: 'Assistante DN', roles: ['assistant_dn', 'SU'] },
  finance: { kind: 'staff', label: 'Finance', roles: ['s5_agent', 'SU'] },
  inspection: { kind: 'staff', label: 'Cellule Inspection', roles: ['r3_agent', 'SU'] },
  applicant: { kind: 'applicant', label: 'Postulant' },
} satisfies Record<string, NextActionOwner>;

/** B4 - a site visit may be recorded as held only when it is still scheduled
 *  and the payment of its M6 phase is validated. Used by the guard
 *  (markAssignedSiteVisitHeld) and by the CI queue (to_hold), so an item shown
 *  as « Visite à enregistrer » is always accepted by the guard. */
export function canRecordSiteVisitHeld(visit: { status: string }, payment: { status: string } | null): boolean {
  return visit.status === 'scheduled' && payment?.status === 'validated';
}

// ── Domain keys (spec §5) ─────────────────────────────────────────────────
export const COURRIER_BUCKETS = ['to_print', 'with_dg', 'returned', 'inactive'] as const;
export type CourrierBucket = (typeof COURRIER_BUCKETS)[number];
export type CourrierActionKey =
  | 'print_for_dg'
  | 'record_dg_annotation'
  | 'handed_to_assistant_dn'
  | 'handed_to_dn'
  | 'none';

export const DN_CIRCUIT_BUCKETS = ['to_send', 'with_director', 'returned', 'inactive'] as const;
export type DnCircuitBucket = (typeof DN_CIRCUIT_BUCKETS)[number];
export type DnCircuitActionKey = 'send_to_director' | 'record_director_annotation' | 'handed_to_dn' | 'none';

export const FINANCE_AWAITING_APPLICANT_BUCKET = 'awaiting_applicant' as const;
export const FINANCE_BUCKETS = ['invoice_to_send', 'proof_to_validate', FINANCE_AWAITING_APPLICANT_BUCKET, 'done', 'inactive'] as const;
export type FinanceBucket = (typeof FINANCE_BUCKETS)[number];
export type FinanceActionKey = 'send_invoice' | 'validate_payment_proof' | 'await_payment_proof' | 'none';

export const INSPECTION_BUCKETS = ['to_hold', 'verdict_due', 'awaiting_payment', 'closed', 'inactive'] as const;
export type InspectionBucket = (typeof INSPECTION_BUCKETS)[number];
export type InspectionActionKey = 'record_visit_held' | 'submit_verdict' | 'await_payment' | 'none';
