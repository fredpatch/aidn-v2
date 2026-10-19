# SESSION1-COCKPIT-1 - Operational cockpits per role: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réception / Assistant DG, Assistante DN, Finance and Cellule Inspection each land on one work queue that says what needs their action now, what waits on whom, what is late, and which action opening an item leads to. The three role dashboards are retired, and B1–B6 are fixed.

**Architecture:**

- **Shared contract.** `@aidn/shared` holds the operational contract (`OperationalQueueItem`, urgency, owners, bucket and action-key unions, `canRecordSiteVisitHeld`).
- **Server-side read models.** Each domain API computes `bucket`, `state`, `owner`, `actionKey`, `blockReason` and `urgency` on the server, in a fixed number of queries, and sends no French.
- **Presentation-only shell.** The admin app renders every queue with one shell (`components/cockpit/*`, `lib/cockpit/*`). Each domain keeps its own copy, metrics, pane body and mutations.
- **Home routing.** A pure `homeFor(roles)` sends each user to their queue.

**Tech Stack:**

- API: Express, Drizzle 0.45, PostgreSQL, `node:test` via `tsx --test`.
- Shared: `packages/shared` (TypeScript, consumed through `dist/`; rebuild after every change).
- Admin: React, Vite, TanStack Query, vitest and Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-16-session1-cockpit-1-design.md`. Read it with this plan; it is the authority.

## Global Constraints

- **`items` and `counts` (spec §4, frozen).** `items` contains every row, `inactive` included. `counts` has every bucket key; `counts.inactive` may be non-zero but is never read by a metric, a tab badge or an action count. « Tous » counts `items.length`.
- **`owner`** is the actor expected to perform the current step; it is `null` for done and inactive rows, except `phase_not_open`, whose owner is DN.
- **No French in the new read models** (D13): no `statusLabel` or `nextActionLabel` in the courrier, Directeur DN, Finance or CI queues. The admin maps keys to French.
- **Domain fields** stay outside the shared base contract (R2).
- **Urgency comes only from existing parameters:**
  - `dg_circuit_alert_days` (default 3, working days);
  - `dashboard_sla_signature_deposit_days` (default 1);
  - `dashboard_sla_invoice_upload_days` (default 2);
  - `dashboard_sla_payment_validation_days` (default 1);
  - `public_holidays`.
    The Directeur DN circuit and the awaited payment proof are informational (`normal`). The « + 4 j » proof rule is gone (D10).
- **CI visit urgency** (frozen): visit day after today → `normal`; today → `warning` (« Échéance proche »); before today → `overdue` (« En retard »).
- **B4:** a visit may be scheduled before payment; it may be recorded as held only when the M6 payment is `validated`. The held update is a compare-and-set on `status = 'scheduled'`; no returned row → `MEETING_NOT_SCHEDULED` (409).
- **SU actionability** (D11/D14): the CTA needs UX-1 `canAct(owner, roles)`. CI additionally needs `assignedToViewer` (the services require `meetings.dn_agent_id = actor`).
- **Queue modes** (approved correction): `action` (normal → « À traiter »), `waiting` (normal → « En attente »), `history` (by day). Courriers: to_print action, with_dg waiting. Circuit Directeur DN: to_send action, with_director waiting. Finance: invoice_to_send and proof_to_validate action, awaiting_applicant waiting. CI: to_hold and verdict_due action, awaiting_payment waiting. done / returned / closed / « Tous »: history.
- **Header metrics** come from the queue rows and counts only, with no extra query. « 30 j » metrics only use dates already in the rows. No activity feeds, no period filter.
- **Visible wording:**
  - « Annotation du DG » for the initial request, M3 declaration and M4 letter circuits (D7);
  - « preuve de paiement » (D8);
  - Finance, Agent Finance, Cellule Inspection, Agent CI, Réception, Assistant DG, Assistante DN.
    No visible « S5 » or « R3 ».
- **Unchanged:** technical role keys, routes and files (`s5_agent`, `r3_agent`, `/paiements-s5`, `S5PaymentsPage.tsx`, `MyInspectionsPage.tsx`, …).
- **Out of scope:** the DN dashboard (`DashboardPage`, `/api/dashboard/summary`) and analytics, the portal, ACCOUNT-1, migrations, the auth model.
- **Commits:** none per task. One commit after full validation (Task 11). Do not push. Never stage `exploration-cache/reference/*`.
- **Commands** (from the repo root unless stated):
  - `npm run build --workspace=packages/shared` after any change in `packages/shared`.
  - API, all tests: from `apps/api`, `npx tsx --test --test-concurrency=1 "src/**/*.test.ts"`. (`npm run test -- --test-concurrency=1` places the flag after the glob, where it has no effect; do not use it.)
  - API, one file: from `apps/api`, `npx tsx --test --test-concurrency=1 src/modules/<path>.test.ts`.
  - DB tests need `DATABASE_URL` on a migrated, disposable database (for example `postgresql://postgres:admin@localhost:5432/aidn_v2_meet2_test`); they skip without it. **Never** the dev database from `apps/api/.env`.
  - Admin: `npm run test --workspace=apps/admin`; one file: from `apps/admin`, `npx vitest run <path>`.
  - Typecheck: `npm run typecheck --workspaces --if-present`. Lint: `npm run lint --workspaces --if-present` (the root `npm run lint` glob does not expand on Windows).

## Review Focus

1. **Rows with no step date.** Examples: a grandfathered Directeur DN circuit (`pending_review`, no `signatureSentAt`), a legacy `signed` courrier, a payment rejected before any proof. Expected: sorting and the age badge never produce `NaN`, « Invalid Date » or a crash; null dates sort last in action tabs. Pinned in Task 2 (`sortQueue`, `AgingBadge`).
2. **The selected item leaves the current tab after an action** (printed → `with_dg`, held → `verdict_due`, closed meanwhile → `inactive`). Expected: the pane falls back to the first visible row of the tab, never a stale or empty pane while rows exist. Pinned in Task 2 (`useUrlSelection`) and Task 5 (courrier print flow).
3. **Users with overlapping roles:**
   - `reception` + `assistant_dg` gets « À imprimer »;
   - `assistant_dn` + `s5_agent` lands on Finance;
   - SU + `r3_agent` sees every mission but gets « Enregistrer la tenue » only on their own.
     Pinned in Task 3 (`homeFor`, `courrierDefaultTab`) and Task 10 (CI pane).
4. **A 409 `DOSSIER_CLOSED` during an action.** Expected: the list reloads, the row moves to « Tous » with the closed badge and no CTA, and the error banner shows the API message. Pinned in Task 5 (courrier) and Task 8 (Finance).
5. **An empty queue on first landing** (redirected from `/`). Expected: the default tab shows its empty state, the metrics show 0, and no error appears. Pinned in Task 2 (`QueueColumn`) and Task 8 (Finance page).

---

### Task 1: Shared operational contract and owners

**Files:**

- Create: `packages/shared/src/operational-queue.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from './operational-queue.js';`)
- Modify: `apps/api/src/modules/requests/cockpit-next-action.ts:10-19` (OWNERS → `OPERATIONAL_OWNERS`)
- Modify: `apps/admin/src/pages/phases/owners.ts:1-22` (constants → `OPERATIONAL_OWNERS`)
- Test: `apps/api/src/modules/operational/operational-queue.shared.test.ts` (shared has no runner; the API's `tsx --test` runs it)

**Interfaces:**

- Produces (used by every later task):
  - `type OperationalUrgency = 'normal' | 'warning' | 'overdue'`, `URGENCY_RANK`, `type OperationalBlockReason`.
  - `interface OperationalQueueItem<B extends string, K extends string>`, `interface OperationalQueue<I, B extends string>`.
  - `urgencyFromAge(age: number | null, targetDays: number): OperationalUrgency`.
  - `visitDayUrgency(scheduledAt: Date, now: Date): OperationalUrgency`.
  - `countBuckets<B extends string>(keys: readonly B[], items: ReadonlyArray<{ bucket: B }>): Record<B, number>`.
  - `OPERATIONAL_OWNERS` (`dn`, `reception`, `assistantDg`, `assistantDn`, `finance`, `inspection`, `applicant`).
  - `canRecordSiteVisitHeld(visit: { status: string }, payment: { status: string } | null): boolean`.
  - `COURRIER_BUCKETS`, `CourrierBucket`, `CourrierActionKey`, `DN_CIRCUIT_BUCKETS`, `DnCircuitBucket`, `DnCircuitActionKey`, `FINANCE_BUCKETS`, `FinanceBucket`, `FinanceActionKey`, `INSPECTION_BUCKETS`, `InspectionBucket`, `InspectionActionKey`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/operational/operational-queue.shared.test.ts`:

```ts
/** SESSION1-COCKPIT-1 - the shared operational contract: urgency rules, bucket
 *  counts, owners (single source) and the B4 held-visit predicate. Pure. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import {
  COURRIER_BUCKETS,
  DN_CIRCUIT_BUCKETS,
  FINANCE_BUCKETS,
  INSPECTION_BUCKETS,
  OPERATIONAL_OWNERS,
  canRecordSiteVisitHeld,
  countBuckets,
  urgencyFromAge,
  visitDayUrgency,
} from '@aidn/shared';
import { OWNERS } from '../requests/cockpit-next-action.js';
import courrierRoute from '../courrier-tasks/courrier-tasks.route.js';
import dnAnnotationRoute from '../dn-annotation/dn-annotation.route.js';

describe('urgencyFromAge (existing dashboard rule, moved unchanged)', () => {
  it('normal below target - 1, warning from max(target - 1, 1), overdue above target', () => {
    assert.equal(urgencyFromAge(null, 2), 'normal');
    assert.equal(urgencyFromAge(0.5, 2), 'normal');
    assert.equal(urgencyFromAge(1, 2), 'warning');
    assert.equal(urgencyFromAge(2, 2), 'warning');
    assert.equal(urgencyFromAge(2.1, 2), 'overdue');
    // target 1: warning starts at 1 (max(0, 1)), overdue above 1
    assert.equal(urgencyFromAge(0.9, 1), 'normal');
    assert.equal(urgencyFromAge(1, 1), 'warning');
    assert.equal(urgencyFromAge(1.1, 1), 'overdue');
  });
});

describe('visitDayUrgency (frozen CI rule)', () => {
  const now = new Date(2026, 9, 16, 10, 0);
  it('future day normal, same day warning, past day overdue', () => {
    assert.equal(visitDayUrgency(new Date(2026, 9, 17, 8, 0), now), 'normal');
    assert.equal(visitDayUrgency(new Date(2026, 9, 16, 23, 0), now), 'warning');
    assert.equal(visitDayUrgency(new Date(2026, 9, 16, 7, 0), now), 'warning');
    assert.equal(visitDayUrgency(new Date(2026, 9, 15, 23, 59), now), 'overdue');
  });
});

describe('countBuckets', () => {
  it('always returns every key, inactive included', () => {
    const counts = countBuckets(COURRIER_BUCKETS, [
      { bucket: 'to_print' },
      { bucket: 'inactive' },
      { bucket: 'to_print' },
    ]);
    assert.deepEqual(counts, { to_print: 2, with_dg: 0, returned: 0, inactive: 1 });
    assert.deepEqual(Object.keys(countBuckets(DN_CIRCUIT_BUCKETS, [])).sort(), [
      'inactive',
      'returned',
      'to_send',
      'with_director',
    ]);
    assert.deepEqual(Object.keys(countBuckets(FINANCE_BUCKETS, [])).sort(), [
      'awaiting_applicant',
      'done',
      'inactive',
      'invoice_to_send',
      'proof_to_validate',
    ]);
    assert.deepEqual(Object.keys(countBuckets(INSPECTION_BUCKETS, [])).sort(), [
      'awaiting_payment',
      'closed',
      'inactive',
      'to_hold',
      'verdict_due',
    ]);
  });
});

describe('OPERATIONAL_OWNERS', () => {
  it('is the cockpit OWNERS (one source, unchanged values)', () => {
    assert.equal(OWNERS, OPERATIONAL_OWNERS);
    assert.deepEqual(OPERATIONAL_OWNERS.finance, {
      kind: 'staff',
      label: 'Finance',
      roles: ['s5_agent', 'SU'],
    });
    assert.deepEqual(OPERATIONAL_OWNERS.inspection, {
      kind: 'staff',
      label: 'Cellule Inspection',
      roles: ['r3_agent', 'SU'],
    });
    assert.deepEqual(OPERATIONAL_OWNERS.applicant, { kind: 'applicant', label: 'Postulant' });
  });

  type Layer = { handle: (req: Request, res: Response, next: () => void) => void };
  function passes(router: unknown, role: string): boolean {
    let allowed = false;
    const res = { status: () => ({ json: () => undefined }) } as unknown as Response;
    (router as { stack: Layer[] }).stack[1].handle(
      { user: { userId: 1, roles: [role] } } as unknown as Request,
      res,
      () => {
        allowed = true;
      }
    );
    return allowed;
  }
  const ALL = [
    'dn_agent',
    'dn_supervisor',
    'reception',
    'assistant_dg',
    'assistant_dn',
    's5_agent',
    'r3_agent',
    'SU',
  ];

  it('courrier owners carry exactly the courrier route guard roles', () => {
    for (const owner of [OPERATIONAL_OWNERS.reception, OPERATIONAL_OWNERS.assistantDg]) {
      assert.deepEqual(
        ALL.filter((role) => passes(courrierRoute, role)).sort(),
        [...owner.roles].sort()
      );
    }
  });

  it('the Assistante DN owner carries exactly the Directeur DN circuit route guard roles', () => {
    assert.deepEqual(
      ALL.filter((role) => passes(dnAnnotationRoute, role)).sort(),
      [...OPERATIONAL_OWNERS.assistantDn.roles].sort()
    );
  });
});

describe('canRecordSiteVisitHeld (B4)', () => {
  it('only a scheduled visit whose payment is validated', () => {
    assert.equal(canRecordSiteVisitHeld({ status: 'scheduled' }, { status: 'validated' }), true);
    for (const status of ['awaiting_invoice', 'awaiting_proof', 'pending_validation', 'rejected']) {
      assert.equal(canRecordSiteVisitHeld({ status: 'scheduled' }, { status }), false, status);
    }
    assert.equal(canRecordSiteVisitHeld({ status: 'scheduled' }, null), false);
    assert.equal(canRecordSiteVisitHeld({ status: 'held' }, { status: 'validated' }), false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/api`): `npx tsx --test --test-concurrency=1 src/modules/operational/operational-queue.shared.test.ts`
Expected: FAIL, because `@aidn/shared` has no export `COURRIER_BUCKETS`.

- [ ] **Step 3: Write the shared module**

Create `packages/shared/src/operational-queue.ts`:

```ts
/**
 * SESSION1-COCKPIT-1 - operational work queues (Réception / Assistant DG,
 * Assistante DN, Finance, Cellule Inspection). The API computes every field;
 * the admin maps the keys to French (D13). Domain fields stay in each domain's
 * item type (R2).
 */
import type { NextActionOwner, OperationalState } from './applicant-actions.js';

export type OperationalUrgency = 'normal' | 'warning' | 'overdue';

/** Sort rank: overdue first. */
export const URGENCY_RANK: Record<OperationalUrgency, number> = {
  overdue: 0,
  warning: 1,
  normal: 2,
};

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
  const day = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const visit = day(scheduledAt);
  const today = day(now);
  if (visit < today) return 'overdue';
  if (visit === today) return 'warning';
  return 'normal';
}

export function countBuckets<B extends string>(
  keys: readonly B[],
  items: ReadonlyArray<{ bucket: B }>
): Record<B, number> {
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
export function canRecordSiteVisitHeld(
  visit: { status: string },
  payment: { status: string } | null
): boolean {
  return visit.status === 'scheduled' && payment?.status === 'validated';
}

// ── Domain keys (spec §5) ─────────────────────────────────────────────────
export const COURRIER_BUCKETS = ['to_print', 'with_dg', 'returned', 'inactive'] as const;
export type CourrierBucket = (typeof COURRIER_BUCKETS)[number];
export type CourrierActionKey =
  'print_for_dg' | 'record_dg_annotation' | 'handed_to_assistant_dn' | 'handed_to_dn' | 'none';

export const DN_CIRCUIT_BUCKETS = ['to_send', 'with_director', 'returned', 'inactive'] as const;
export type DnCircuitBucket = (typeof DN_CIRCUIT_BUCKETS)[number];
export type DnCircuitActionKey =
  'send_to_director' | 'record_director_annotation' | 'handed_to_dn' | 'none';

export const FINANCE_BUCKETS = [
  'invoice_to_send',
  'proof_to_validate',
  'awaiting_applicant',
  'done',
  'inactive',
] as const;
export type FinanceBucket = (typeof FINANCE_BUCKETS)[number];
export type FinanceActionKey =
  'send_invoice' | 'validate_payment_proof' | 'await_payment_proof' | 'none';

export const INSPECTION_BUCKETS = [
  'to_hold',
  'verdict_due',
  'awaiting_payment',
  'closed',
  'inactive',
] as const;
export type InspectionBucket = (typeof INSPECTION_BUCKETS)[number];
export type InspectionActionKey = 'record_visit_held' | 'submit_verdict' | 'await_payment' | 'none';
```

Add to `packages/shared/src/index.ts`: `export * from './operational-queue.js';`

- [ ] **Step 4: Point the two owner copies at the shared constant**

In `apps/api/src/modules/requests/cockpit-next-action.ts`, replace the `DN_ROLES` constant and the `OWNERS` object (lines 8-19) with the code below, and add `OPERATIONAL_OWNERS` to the existing `@aidn/shared` import:

```ts
/** SESSION1-COCKPIT-1 - single source in @aidn/shared (values unchanged). */
export const OWNERS = OPERATIONAL_OWNERS;
```

If `DN_ROLES` is used elsewhere in the file, keep it.

In `apps/admin/src/pages/phases/owners.ts`, replace the six constants with the code below, keeping the import of `expectsPaymentProof`, `NextActionOwner` and `OperationalState` (add `OPERATIONAL_OWNERS`):

```ts
/** SESSION1-COCKPIT-1 - the owners come from @aidn/shared (single source). */
export const DN_OWNER: NextActionOwner = OPERATIONAL_OWNERS.dn;
export const RECEPTION_OWNER: NextActionOwner = OPERATIONAL_OWNERS.reception;
export const ASSISTANT_DG_OWNER: NextActionOwner = OPERATIONAL_OWNERS.assistantDg;
export const FINANCE_OWNER: NextActionOwner = OPERATIONAL_OWNERS.finance;
export const INSPECTION_OWNER: NextActionOwner = OPERATIONAL_OWNERS.inspection;
export const APPLICANT_OWNER: NextActionOwner = OPERATIONAL_OWNERS.applicant;
```

- [ ] **Step 5: Build shared and run the tests**

Run: `npm run build --workspace=packages/shared`, then from `apps/api`: `npx tsx --test --test-concurrency=1 src/modules/operational/operational-queue.shared.test.ts src/modules/requests/cockpit-next-action.test.ts`
Expected: PASS. Also run `npx vitest run src/pages/phases` from `apps/admin`. Expected: PASS (owner values unchanged).

---

### Task 2: Admin cockpit primitives

**Files:**

- Modify: `apps/admin/src/lib/dayGroups.ts:16-20` (widen `DayGroup.key` to `string`)
- Create: `apps/admin/src/lib/cockpit/queue.ts` (`sortQueue`, `groupQueue`, `filterQueue`, `defaultOrderFor`)
- Create: `apps/admin/src/lib/cockpit/useUrlSelection.ts`, `apps/admin/src/lib/cockpit/useQueueTab.ts`
- Create: `apps/admin/src/components/cockpit/CockpitPage.tsx`, `CockpitMetrics.tsx`, `QueueColumn.tsx`, `QueueReadingPane.tsx`, `AgingBadge.tsx`, `CockpitUploadModal.tsx`
- Test: `apps/admin/src/lib/cockpit/queue.test.ts`, `apps/admin/src/components/cockpit/cockpit.test.tsx`

**Interfaces:**

- Consumes: `OperationalUrgency`, `URGENCY_RANK`, `OperationalQueueItem` (Task 1); `MessageList`, `BucketTabs`, `EmptyState`, `OperationalCallout` (existing).
- Produces:
  - `type AgeOrder = 'oldest' | 'newest'`; `type QueueMode = 'action' | 'waiting' | 'history'` (approved correction: a waiting bucket is never « À traiter »).
  - `sortQueue<T extends QueueRow>(items: T[], mode: QueueMode, order: AgeOrder): T[]` where `QueueRow = { id: string; urgency: OperationalUrgency; stepSince: string | null }`.
  - `groupQueue<T extends QueueRow>(items: T[], mode: QueueMode, now?: Date): DayGroup<T>[]`.
  - `filterQueue<T extends QueueRow & { bucket: string }>(items: T[], tab: string, needle: string, haystack: (item: T) => string): T[]`.
  - `defaultOrderFor(mode: QueueMode): AgeOrder`.
  - `useUrlSelection<T extends { id: string }>(visible: T[], ready?: boolean): { selected: T | null; select: (item: T) => void }` (once `ready`, a stale `?id=` is replaced by the fallback id, or removed).
  - `useQueueTab<K extends string>(allowed: readonly K[], fallback: K): [K, (tab: K) => void]`.
  - Components: `CockpitPage`, `CockpitMetrics` + `type CockpitMetric`, `QueueColumn`, `QueueReadingPane`, `QueueEmptyPane`, `AgingBadge`, `CockpitUploadModal` (props below).

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/src/lib/cockpit/queue.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultOrderFor, filterQueue, groupQueue, sortQueue } from './queue';

const row = (
  id: string,
  urgency: 'normal' | 'warning' | 'overdue',
  stepSince: string | null,
  bucket = 'a'
) => ({
  id,
  urgency,
  stepSince,
  bucket,
});

describe('sortQueue', () => {
  it('action mode: overdue, warning, normal; oldest first inside; null dates last; id tie-break', () => {
    const items = [
      row('n1', 'normal', '2026-10-10T09:00:00Z'),
      row('o2', 'overdue', '2026-10-09T09:00:00Z'),
      row('w1', 'warning', null),
      row('o1', 'overdue', '2026-10-01T09:00:00Z'),
      row('w0', 'warning', '2026-10-12T09:00:00Z'),
      row('n0', 'normal', '2026-10-10T09:00:00Z'),
    ];
    expect(sortQueue(items, 'action', 'oldest').map((i) => i.id)).toEqual([
      'o1',
      'o2',
      'w0',
      'w1',
      'n0',
      'n1',
    ]);
    expect(sortQueue(items, 'action', 'newest').map((i) => i.id)).toEqual([
      'o2',
      'o1',
      'w0',
      'w1',
      'n0',
      'n1',
    ]);
  });

  it('history mode: date only, newest first by default, nulls last', () => {
    const items = [
      row('a', 'overdue', '2026-10-01T09:00:00Z'),
      row('b', 'normal', null),
      row('c', 'normal', '2026-10-05T09:00:00Z'),
    ];
    expect(sortQueue(items, 'history', 'newest').map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(sortQueue(items, 'history', 'oldest').map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('defaults: action oldest first, history newest first', () => {
    expect(defaultOrderFor('action')).toBe('oldest');
    expect(defaultOrderFor('waiting')).toBe('oldest');
    expect(defaultOrderFor('history')).toBe('newest');
  });
});

describe('groupQueue', () => {
  it('action mode: one group per urgency present, labelled', () => {
    const groups = groupQueue(
      sortQueue([row('a', 'normal', null), row('b', 'overdue', null)], 'action', 'oldest'),
      'action'
    );
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['En retard', ['b']],
      ['À traiter', ['a']],
    ]);
  });

  it('waiting mode: urgency first like action, but a normal item is « En attente », never « À traiter »', () => {
    const items = [
      row('n', 'normal', '2026-10-01T09:00:00Z'),
      row('o', 'overdue', '2026-10-05T09:00:00Z'),
      row('w', 'warning', null),
    ];
    const groups = groupQueue(sortQueue(items, 'waiting', 'oldest'), 'waiting');
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['En retard', ['o']],
      ['Échéance proche', ['w']],
      ['En attente', ['n']],
    ]);
    expect(groups.some((g) => g.label === 'À traiter')).toBe(false);
  });

  it('history mode: day groups; a null date never produces Invalid Date', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    const groups = groupQueue(
      [row('a', 'normal', '2026-10-16T08:00:00Z'), row('b', 'normal', null)],
      'history',
      now
    );
    expect(groups.map((g) => g.label)).toEqual(["Aujourd'hui", 'Plus ancien']);
  });
});

describe('filterQueue', () => {
  const items = [row('x', 'normal', null, 'to_print'), row('y', 'normal', null, 'inactive')];
  it('« all » keeps inactive rows; a bucket tab keeps its bucket only; search is accent-insensitive', () => {
    expect(filterQueue(items, 'all', '', () => '').map((i) => i.id)).toEqual(['x', 'y']);
    expect(filterQueue(items, 'to_print', '', () => '').map((i) => i.id)).toEqual(['x']);
    expect(
      filterQueue(items, 'all', 'societe', (i) => (i.id === 'x' ? 'Société' : 'autre')).map(
        (i) => i.id
      )
    ).toEqual(['x']);
  });
});
```

Create `apps/admin/src/components/cockpit/cockpit.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AgingBadge } from './AgingBadge';
import { QueueColumn } from './QueueColumn';
import { CockpitUploadModal } from './CockpitUploadModal';
import { useUrlSelection } from '../../lib/cockpit/useUrlSelection';

const NOW = new Date('2026-10-16T12:00:00Z');

describe('<AgingBadge>', () => {
  it('overdue / warning / normal, working days, future due date, and nothing without a date', () => {
    const { rerender, container } = render(
      <AgingBadge urgency="overdue" since="2026-10-11T12:00:00Z" now={NOW} />
    );
    expect(screen.getByText('En retard · J+5')).toBeInTheDocument();
    rerender(<AgingBadge urgency="warning" since="2026-10-15T12:00:00Z" now={NOW} />);
    expect(screen.getByText('Échéance proche')).toBeInTheDocument();
    rerender(<AgingBadge urgency="normal" since="2026-10-13T12:00:00Z" now={NOW} />);
    expect(screen.getByText('depuis 3 j')).toBeInTheDocument();
    rerender(
      <AgingBadge urgency="normal" since="2026-10-13T12:00:00Z" workingDays={2} now={NOW} />
    );
    expect(screen.getByText('depuis 2 j ouvrés')).toBeInTheDocument();
    rerender(<AgingBadge urgency="normal" since={null} dueAt="2026-10-19T09:00:00Z" now={NOW} />);
    expect(screen.getByText('dans 3 j')).toBeInTheDocument();
    rerender(<AgingBadge urgency="normal" since={null} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('<QueueColumn>', () => {
  const base = {
    tabs: [{ key: 'a' as const, label: 'A', count: 0 }],
    tab: 'a' as const,
    onTabChange: () => undefined,
    order: 'oldest' as const,
    onOrderChange: () => undefined,
    selectedId: null,
    texts: {
      loading: 'Chargement X',
      error: 'Erreur X',
      empty: 'Vide X',
      listLabel: 'Liste X',
      noun: ['élément', 'éléments'] as [string, string],
    },
    onSelect: () => undefined,
    onActivate: () => undefined,
    renderRow: (item: { id: string }) => <span>{item.id}</span>,
  };
  it('three distinct states: loading, error, empty', () => {
    const { rerender } = render(<QueueColumn {...base} groups={[]} status="loading" />);
    expect(screen.getByText('Chargement X')).toBeInTheDocument();
    rerender(<QueueColumn {...base} groups={[]} status="error" />);
    expect(screen.getByText('Erreur X')).toBeInTheDocument();
    expect(screen.queryByText('Vide X')).not.toBeInTheDocument();
    rerender(<QueueColumn {...base} groups={[]} status="ready" />);
    expect(screen.getByText('Vide X')).toBeInTheDocument();
  });
});

describe('useUrlSelection', () => {
  function Probe({ ids, ready = true }: { ids: string[]; ready?: boolean }) {
    const { selected, select } = useUrlSelection(
      ids.map((id) => ({ id })),
      ready
    );
    const location = useLocation();
    return (
      <div>
        <p>selected:{selected?.id ?? 'none'}</p>
        <p>search:{location.search}</p>
        <button onClick={() => select({ id: 'b' })}>pick b</button>
      </div>
    );
  }
  it('falls back to the first visible row when ?id= is missing or not visible', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/x?id=gone']}>
        <Routes>
          <Route path="/x" element={<Probe ids={['a', 'b']} />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('selected:a')).toBeInTheDocument();
    fireEvent.click(screen.getByText('pick b'));
    expect(screen.getByText('selected:b')).toBeInTheDocument();
    expect(screen.getByText('search:?id=b')).toBeInTheDocument();
    rerender(
      <MemoryRouter initialEntries={['/x?id=b']}>
        <Routes>
          <Route path="/x" element={<Probe ids={[]} />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('selected:none')).toBeInTheDocument();
  });

  it('once ready, a stale ?id= is replaced by the fallback id, or removed when no row remains; never while loading', async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/x?id=gone&tab=t']}>
        <Routes>
          <Route path="/x" element={<Probe ids={['a']} />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('search:?id=a&tab=t')).toBeInTheDocument();
    unmount();
    const empty = render(
      <MemoryRouter initialEntries={['/x?id=gone&tab=t']}>
        <Routes>
          <Route path="/x" element={<Probe ids={[]} />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('search:?tab=t')).toBeInTheDocument();
    empty.unmount();
    render(
      <MemoryRouter initialEntries={['/x?id=deep']}>
        <Routes>
          <Route path="/x" element={<Probe ids={[]} ready={false} />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('search:?id=deep')).toBeInTheDocument(); // a deep link survives the first load
  });
});

describe('<CockpitUploadModal>', () => {
  it('submit disabled without a file; shows the busy label', () => {
    const onSubmit = vi.fn();
    const props = {
      title: 'Joindre la facture transmise',
      subtitle: 'DEM-1',
      label: 'Facture',
      accept: '.pdf',
      submitLabel: 'Enregistrer',
      busySubmitLabel: 'Enregistrement...',
      onFileChange: () => undefined,
      onClose: () => undefined,
      onSubmit,
    };
    const { rerender } = render(<CockpitUploadModal {...props} file={null} busy={false} />);
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled();
    rerender(<CockpitUploadModal {...props} file={new File(['x'], 'f.pdf')} busy />);
    expect(screen.getByRole('button', { name: /Enregistrement\.\.\./ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/admin`): `npx vitest run src/lib/cockpit src/components/cockpit`
Expected: FAIL, because the modules do not exist.

- [ ] **Step 3: Widen `DayGroup.key`**

In `apps/admin/src/lib/dayGroups.ts`, change `key: DayGroupKey | 'flat';` to `key: string;`. The comment stays; the key is only used as a React key.

- [ ] **Step 4: Write `lib/cockpit/queue.ts`**

```ts
/** SESSION1-COCKPIT-1 §6 - queue order and grouping, pure. Action and waiting
 *  tabs: overdue, warning, normal, then step date (oldest first by default);
 *  a normal item is « À traiter » in an action tab and « En attente » in a
 *  waiting tab (approved correction). History tabs (done, inactive, « Tous »):
 *  step date, newest first by default. A null step date sorts last. */
import { URGENCY_RANK, type OperationalUrgency } from '@aidn/shared';
import { groupByDay, normalizeSearch, type DayGroup } from '../dayGroups';

export type AgeOrder = 'oldest' | 'newest';
export type QueueMode = 'action' | 'waiting' | 'history';
export interface QueueRow {
  id: string;
  urgency: OperationalUrgency;
  stepSince: string | null;
}

const URGENCY_GROUP_LABELS: Record<
  Exclude<QueueMode, 'history'>,
  Record<OperationalUrgency, string>
> = {
  action: { overdue: 'En retard', warning: 'Échéance proche', normal: 'À traiter' },
  waiting: { overdue: 'En retard', warning: 'Échéance proche', normal: 'En attente' },
};

export function defaultOrderFor(mode: QueueMode): AgeOrder {
  return mode === 'history' ? 'newest' : 'oldest';
}

function compareDates(a: string | null, b: string | null, order: AgeOrder): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const diff = new Date(a).getTime() - new Date(b).getTime();
  return order === 'oldest' ? diff : -diff;
}

export function sortQueue<T extends QueueRow>(items: T[], mode: QueueMode, order: AgeOrder): T[] {
  return [...items].sort((a, b) => {
    if (mode !== 'history' && a.urgency !== b.urgency)
      return URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    return compareDates(a.stepSince, b.stepSince, order) || a.id.localeCompare(b.id);
  });
}

/** Groups an already sorted list: by urgency in action / waiting mode, by day in history. */
export function groupQueue<T extends QueueRow>(
  items: T[],
  mode: QueueMode,
  now: Date = new Date()
): DayGroup<T>[] {
  if (mode === 'history')
    return groupByDay(items, (item) => item.stepSince ?? new Date(0).toISOString(), now);
  const labels = URGENCY_GROUP_LABELS[mode];
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.key === item.urgency) last.items.push(item);
    else groups.push({ key: item.urgency, label: labels[item.urgency], items: [item] });
  }
  return groups;
}

/** « all » keeps every row (inactive included); any other tab keeps its bucket. */
export function filterQueue<T extends QueueRow & { bucket: string }>(
  items: T[],
  tab: string,
  needle: string,
  haystack: (item: T) => string
): T[] {
  const search = normalizeSearch(needle);
  return items
    .filter((item) => tab === 'all' || item.bucket === tab)
    .filter((item) => !search || normalizeSearch(haystack(item)).includes(search));
}
```

- [ ] **Step 5: Write the hooks**

`apps/admin/src/lib/cockpit/useUrlSelection.ts`:

```ts
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/** `?id=` selection; never shows an item that is not visible: falls back to
 *  the first visible row, or to none. Once the list is `ready` (loaded), a
 *  stale `?id=` (the row left the tab after a mutation) is replaced by the
 *  fallback id, or removed when no row remains. Never while loading, so a
 *  deep link survives the first fetch. */
export function useUrlSelection<T extends { id: string }>(visible: T[], ready = true) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('id');
  const selected = visible.find((item) => item.id === requested) ?? visible[0] ?? null;
  const fallbackId = selected?.id ?? null;
  useEffect(() => {
    if (!ready || requested === null || requested === fallbackId) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (fallbackId === null) next.delete('id');
        else next.set('id', fallbackId);
        return next;
      },
      { replace: true }
    );
  }, [ready, requested, fallbackId, setParams]);
  function select(item: T) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('id', item.id);
        return next;
      },
      { replace: true }
    );
  }
  return { selected, select };
}
```

`apps/admin/src/lib/cockpit/useQueueTab.ts`:

```ts
import { useSearchParams } from 'react-router-dom';

/** `?tab=` with a default; an unknown value falls back to the default. */
export function useQueueTab<K extends string>(
  allowed: readonly K[],
  fallback: K
): [K, (tab: K) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab = allowed.includes(raw as K) ? (raw as K) : fallback;
  function setTab(next: K) {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set('tab', next);
        out.delete('id');
        return out;
      },
      { replace: true }
    );
  }
  return [tab, setTab];
}
```

- [ ] **Step 6: Write the components**

`components/cockpit/AgingBadge.tsx`:

```tsx
import type { OperationalUrgency } from '@aidn/shared';
import { cn } from '../../lib/utils';

const DAY_MS = 86_400_000;

/** §6 - one aging treatment. overdue: « En retard · J+n »; warning:
 *  « Échéance proche »; normal: « depuis n j » / « dans n j ». n counts
 *  working days when `workingDays` is given (« j ouvrés »). No date: nothing. */
export function AgingBadge({
  urgency,
  since,
  dueAt = null,
  workingDays = null,
  now = new Date(),
}: {
  urgency: OperationalUrgency;
  since: string | null;
  dueAt?: string | null;
  workingDays?: number | null;
  now?: Date;
}) {
  const unit = workingDays !== null ? 'j ouvrés' : 'j';
  const elapsed = (iso: string) =>
    Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
  if (urgency === 'overdue') {
    const n = dueAt ? elapsed(dueAt) : (workingDays ?? (since ? elapsed(since) : null));
    return <Badge tone="overdue">{n === null ? 'En retard' : `En retard · J+${n}`}</Badge>;
  }
  if (urgency === 'warning') return <Badge tone="warning">Échéance proche</Badge>;
  if (dueAt && new Date(dueAt).getTime() > now.getTime()) {
    return (
      <Badge tone="normal">{`dans ${Math.ceil((new Date(dueAt).getTime() - now.getTime()) / DAY_MS)} j`}</Badge>
    );
  }
  const n = workingDays ?? (since ? elapsed(since) : null);
  if (n === null) return null;
  return <Badge tone="normal">{`depuis ${n} ${unit}`}</Badge>;
}

function Badge({ tone, children }: { tone: OperationalUrgency; children: string }) {
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-full px-1.5 text-[10px] font-semibold leading-4',
        tone === 'overdue' && 'border border-red-200 bg-red-50 text-anac-danger',
        tone === 'warning' && 'border border-orange-200 bg-orange-50 text-anac-warning',
        tone === 'normal' && 'text-anac-muted'
      )}
    >
      {children}
    </span>
  );
}
```

`components/cockpit/CockpitMetrics.tsx`:

```tsx
import { cn } from '../../lib/utils';

export interface CockpitMetric {
  key: string;
  label: string;
  value: number | string;
  /** e.g. « dont 2 en retard »; null hides it. */
  detail?: string | null;
  tone: 'info' | 'warning' | 'success' | 'danger' | 'neutral';
}

const TONES: Record<CockpitMetric['tone'], string> = {
  info: 'border-blue-100 bg-blue-50 text-anac-blue',
  warning: 'border-orange-100 bg-orange-50 text-anac-warning',
  success: 'border-green-100 bg-green-50 text-anac-success',
  danger: 'border-red-100 bg-red-50 text-anac-danger',
  neutral: 'border-anac-border bg-white text-anac-navy',
};

/** One metric strip for every role cockpit (replaces the local metric cards). */
export function CockpitMetrics({ items }: { items: CockpitMetric[] }) {
  return (
    <ul aria-label="Synthèse" className="flex flex-wrap gap-2">
      {items.map((metric) => (
        <li
          key={metric.key}
          className={cn('rounded-lg border px-3 py-1.5 text-xs', TONES[metric.tone])}
        >
          <span className="font-semibold">{metric.value}</span> {metric.label}
          {metric.detail ? <span className="opacity-80"> · {metric.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}
```

`components/cockpit/CockpitPage.tsx`:

```tsx
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { CockpitMetrics, type CockpitMetric } from './CockpitMetrics';

/** SESSION1-COCKPIT-1 - frame shared by the role cockpits: title, metric
 *  strip, search (« / » focuses it), error banners, optional block above the
 *  two panes, the list column and the reading pane, then dialogs. */
export function CockpitPage({
  title,
  metrics,
  search,
  errors = [],
  above,
  list,
  pane,
  children,
}: {
  title: string;
  metrics: CockpitMetric[];
  search: { value: string; onChange: (value: string) => void; placeholder: string; label: string };
  errors?: Array<string | null>;
  above?: ReactNode;
  list: ReactNode;
  pane: ReactNode;
  children?: ReactNode;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      return;
    event.preventDefault();
    searchRef.current?.focus();
  }
  return (
    <div className="-m-6 min-h-full bg-[#f8fafc] text-anac-text" onKeyDown={onKeyDown}>
      <main className="mx-auto max-w-[1600px] space-y-4 px-5 py-4">
        <header className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="mr-auto">
            <p className="text-xs font-medium text-anac-muted">Direction de la Navigabilité</p>
            <h1 className="mt-1 text-xl font-semibold leading-tight text-anac-navy">{title}</h1>
          </div>
          <CockpitMetrics items={metrics} />
          <label className="relative block w-full sm:w-[340px]">
            <span className="sr-only">{search.label}</span>
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              className="h-9 w-full rounded-lg border border-anac-border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
              placeholder={search.placeholder}
            />
          </label>
        </header>
        {errors.map((message, index) =>
          message ? (
            <div
              key={index}
              role="alert"
              className="rounded-lg border border-anac-danger/20 bg-red-50 px-4 py-3 text-sm text-anac-danger"
            >
              {message}
            </div>
          ) : null
        )}
        {above}
        <section className="grid items-start gap-4 lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)]">
          {list}
          {pane}
        </section>
        {children}
      </main>
    </div>
  );
}
```

`components/cockpit/QueueColumn.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ArrowDownAZ } from 'lucide-react';
import { BucketTabs } from '../common/BucketTabs';
import { EmptyState } from '../common/EmptyState';
import { MessageList } from '../common/MessageList';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { DayGroup } from '../../lib/dayGroups';
import type { AgeOrder } from '../../lib/cockpit/queue';

export interface QueueTab<K extends string> {
  key: K;
  label: string;
  count: number;
}

/** List column of a role cockpit: tabs, order, list (MessageList keyboard),
 *  three distinct loading / error / empty states, footer. */
export function QueueColumn<T extends { id: string }, K extends string>({
  tabs,
  tab,
  onTabChange,
  order,
  onOrderChange,
  groups,
  selectedId,
  status,
  texts,
  onSelect,
  onActivate,
  renderRow,
}: {
  tabs: QueueTab<K>[];
  tab: K;
  onTabChange: (tab: K) => void;
  order: AgeOrder;
  onOrderChange: (order: AgeOrder) => void;
  groups: DayGroup<T>[];
  selectedId: string | null;
  status: 'loading' | 'error' | 'ready';
  texts: {
    loading: string;
    error: string;
    empty: string;
    listLabel: string;
    noun: [string, string];
  };
  onSelect: (item: T) => void;
  onActivate: (item: T) => void;
  renderRow: (item: T) => ReactNode;
}) {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)] lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)]">
      <BucketTabs size="compact" value={tab} items={tabs} onChange={onTabChange} />
      <div className="flex items-center justify-between gap-3 border-b border-anac-border px-4 py-2">
        <Select value={order} onValueChange={(value) => onOrderChange(value as AgeOrder)}>
          <SelectTrigger
            aria-label="Trier"
            className="h-8 w-[200px] gap-2 text-xs font-semibold text-anac-navy"
          >
            <ArrowDownAZ size={14} className="shrink-0 text-anac-muted" aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="oldest">Plus ancien d&apos;abord</SelectItem>
            <SelectItem value="newest">Plus récent d&apos;abord</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === 'loading' ? (
          <EmptyState title={texts.loading} />
        ) : status === 'error' ? (
          <EmptyState title={texts.error} danger />
        ) : total === 0 ? (
          <EmptyState title={texts.empty} description="Modifiez la recherche ou l'onglet." />
        ) : (
          <MessageList
            groups={groups}
            getId={(item) => item.id}
            selectedId={selectedId}
            ariaLabel={texts.listLabel}
            onSelect={onSelect}
            onActivate={onActivate}
            renderRow={renderRow}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-anac-border bg-anac-gray/50 px-4 py-2 text-[11px] text-anac-muted">
        <span>
          <span className="font-semibold text-anac-navy">{total}</span>{' '}
          {total > 1 ? texts.noun[1] : texts.noun[0]}
        </span>
        <span className="ml-auto hidden md:inline">
          ↑ ↓ naviguer · Entrée action · / rechercher
        </span>
      </div>
    </div>
  );
}
```

`components/cockpit/QueueReadingPane.tsx`:

```tsx
import type { ReactNode } from 'react';
import { EmptyState } from '../common/EmptyState';
import { OperationalCallout, type OperationalCalloutProps } from '../common/OperationalCallout';

const PANE =
  'min-w-0 overflow-hidden rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)]';

/** Reading pane: header, then the operational callout (who acts, CTA only
 *  when canAct, secondary navigation always), then the domain body. */
export function QueueReadingPane({
  ariaLabel,
  header,
  callout,
  children,
}: {
  ariaLabel: string;
  header: ReactNode;
  callout: OperationalCalloutProps;
  children?: ReactNode;
}) {
  return (
    <article aria-label={ariaLabel} className={PANE}>
      <header className="border-b border-anac-border px-5 pb-3 pt-4">{header}</header>
      <div className="space-y-5 px-5 py-4">
        <OperationalCallout {...callout} />
        {children}
      </div>
    </article>
  );
}

export function QueueEmptyPane({ title, description }: { title: string; description: string }) {
  return (
    <article className={`${PANE} grid min-h-[420px] place-items-center p-6`}>
      <EmptyState title={title} description={description} />
    </article>
  );
}
```

`components/cockpit/CockpitUploadModal.tsx`:

```tsx
import { Send } from 'lucide-react';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';

/** Generic one-file upload dialog (courrier DG return, Directeur DN return,
 *  Finance invoice). Wording and business rules stay in the pages. */
export function CockpitUploadModal({
  title,
  subtitle,
  label,
  accept,
  hint,
  submitLabel,
  busySubmitLabel,
  file,
  busy,
  onFileChange,
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  label: string;
  accept: string;
  hint?: string;
  submitLabel: string;
  busySubmitLabel: string;
  file: File | null;
  busy: boolean;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" size="sm" disabled={!file || busy} onClick={onSubmit}>
            <Send size={14} aria-hidden="true" />
            {busy ? busySubmitLabel : submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <label className="label">{label}</label>
        <input
          type="file"
          accept={accept}
          disabled={busy}
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
        {file ? <p className="text-xs text-anac-muted">{file.name}</p> : null}
        {hint ? <p className="text-xs text-anac-muted">{hint}</p> : null}
      </div>
    </Modal>
  );
}
```

If `OperationalCalloutProps` is not exported from `OperationalCallout.tsx`, export it (it is declared with `export interface` there today).

- [ ] **Step 7: Run the tests**

Run (from `apps/admin`): `npx vitest run src/lib/cockpit src/components/cockpit`
Expected: PASS. Then `npx vitest run` for the whole admin suite. Expected: PASS (the `DayGroup.key` widening changes no behaviour).

---

### Task 3: `homeFor`, home route, navigation; admin dashboard pages removed

**Files:**

- Create: `apps/admin/src/lib/home-for.ts`
- Modify: `apps/admin/src/App.tsx` (`HomeRoute`, imports)
- Modify: `apps/admin/src/components/layouts/AppShell.tsx:36-59` (« Tableau de bord » roles, « Circuit Directeur DN » label)
- Delete: `apps/admin/src/pages/dashboard/ReceptionDashboardPage.tsx`, `S5DashboardPage.tsx`, `R3DashboardPage.tsx`
- Modify: `apps/admin/src/lib/api/dashboard.api.ts` (remove `fetchS5DashboardSummary`, `fetchReceptionDashboardSummary`, `fetchR3DashboardSummary`), `apps/admin/src/lib/api/dashboard.types.ts` (remove every `S5Dashboard*`, `ReceptionDashboard*`, `R3Dashboard*` type)
- Test: `apps/admin/src/lib/home-for.test.ts`, `apps/admin/src/App.home.test.tsx`

**Interfaces:**

- Produces:
  - `type Home = { kind: 'dn_dashboard' } | { kind: 'queue'; path: QueuePath } | { kind: 'denied' }`;
  - `type QueuePath = '/paiements-s5' | '/mes-inspections' | '/courriers' | '/circuit-directeur-dn'`;
  - `homeFor(roles: readonly string[]): Home`;
  - `courrierDefaultTab(roles: readonly string[]): 'to_print' | 'with_dg'` (used in Task 5).

- [ ] **Step 1: Write the failing tests**

`apps/admin/src/lib/home-for.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { courrierDefaultTab, homeFor } from './home-for';

describe('homeFor (spec §9)', () => {
  const cases: Array<[string[], ReturnType<typeof homeFor>]> = [
    [['dn_agent'], { kind: 'dn_dashboard' }],
    [['dn_supervisor', 's5_agent'], { kind: 'dn_dashboard' }],
    [['SU'], { kind: 'dn_dashboard' }],
    [['SU', 'r3_agent'], { kind: 'dn_dashboard' }],
    [['s5_agent'], { kind: 'queue', path: '/paiements-s5' }],
    [['r3_agent'], { kind: 'queue', path: '/mes-inspections' }],
    [['reception'], { kind: 'queue', path: '/courriers' }],
    [['assistant_dg'], { kind: 'queue', path: '/courriers' }],
    [['assistant_dn'], { kind: 'queue', path: '/circuit-directeur-dn' }],
    [['assistant_dn', 's5_agent'], { kind: 'queue', path: '/paiements-s5' }],
    [['r3_agent', 'reception'], { kind: 'queue', path: '/mes-inspections' }],
    [['reception', 'assistant_dn'], { kind: 'queue', path: '/courriers' }],
    [
      ['s5_agent', 'r3_agent', 'reception', 'assistant_dn'],
      { kind: 'queue', path: '/paiements-s5' },
    ],
    [[], { kind: 'denied' }],
  ];
  for (const [roles, home] of cases) {
    it(`${roles.join('+') || 'no role'} → ${JSON.stringify(home)}`, () =>
      expect(homeFor(roles)).toEqual(home));
  }
});

describe('courrierDefaultTab (D5)', () => {
  it('Assistant DG alone → Retour DG attendu; anyone else → À imprimer', () => {
    expect(courrierDefaultTab(['assistant_dg'])).toBe('with_dg');
    expect(courrierDefaultTab(['reception'])).toBe('to_print');
    expect(courrierDefaultTab(['reception', 'assistant_dg'])).toBe('to_print');
    expect(courrierDefaultTab(['SU'])).toBe('to_print');
    expect(courrierDefaultTab(['SU', 'assistant_dg'])).toBe('to_print');
  });
});
```

`apps/admin/src/App.home.test.tsx` mocks auth and renders the routes at `/`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

let roles: string[] = [];
vi.mock('./hooks/useAuth', () => ({ useAuth: () => ({ user: { roles } }) }));
vi.mock('./pages/dashboard/DashboardPage', () => ({ default: () => <p>DN dashboard</p> }));

const { HomeRoute } = await import('./App');

function renderHome() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/paiements-s5" element={<p>Finance queue</p>} />
        <Route path="/mes-inspections" element={<p>CI queue</p>} />
        <Route path="/courriers" element={<p>Courriers queue</p>} />
        <Route path="/circuit-directeur-dn" element={<p>DN circuit queue</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HomeRoute', () => {
  it.each([
    [['dn_agent'], 'DN dashboard'],
    [['SU'], 'DN dashboard'],
    [['s5_agent'], 'Finance queue'],
    [['r3_agent'], 'CI queue'],
    [['assistant_dg'], 'Courriers queue'],
    [['assistant_dn'], 'DN circuit queue'],
  ])('%j lands on %s', (r, expected) => {
    roles = r;
    renderHome();
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('no operational role: access denied', () => {
    roles = [];
    renderHome();
    expect(screen.getByText('Accès refusé')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/admin`): `npx vitest run src/lib/home-for.test.ts src/App.home.test.tsx`
Expected: FAIL (`home-for` missing; `HomeRoute` not exported).

- [ ] **Step 3: Write `lib/home-for.ts`**

```ts
/** SESSION1-COCKPIT-1 §9 - where each user lands on « / ». DN roles and SU
 *  keep the DN dashboard; a non-DN user lands on their work queue, with a
 *  fixed precedence when several apply. Pure. */
export type QueuePath =
  '/paiements-s5' | '/mes-inspections' | '/courriers' | '/circuit-directeur-dn';
export type Home =
  { kind: 'dn_dashboard' } | { kind: 'queue'; path: QueuePath } | { kind: 'denied' };

export function homeFor(roles: readonly string[]): Home {
  const has = (role: string) => roles.includes(role);
  if (has('dn_agent') || has('dn_supervisor') || has('SU')) return { kind: 'dn_dashboard' };
  if (has('s5_agent')) return { kind: 'queue', path: '/paiements-s5' };
  if (has('r3_agent')) return { kind: 'queue', path: '/mes-inspections' };
  if (has('reception') || has('assistant_dg')) return { kind: 'queue', path: '/courriers' };
  if (has('assistant_dn')) return { kind: 'queue', path: '/circuit-directeur-dn' };
  return { kind: 'denied' };
}

/** D5 - Assistant DG alone starts on « Retour DG attendu »; anyone else
 *  (Réception, both roles, SU) on « À imprimer ». */
export function courrierDefaultTab(roles: readonly string[]): 'to_print' | 'with_dg' {
  return roles.includes('assistant_dg') && !roles.includes('reception') && !roles.includes('SU')
    ? 'with_dg'
    : 'to_print';
}
```

- [ ] **Step 4: Rewrite `HomeRoute`**

In `apps/admin/src/App.tsx`:

- remove the imports of `ReceptionDashboardPage`, `R3DashboardPage` and `S5DashboardPage`;
- remove the now-unused `DASHBOARD_ROLES` constant;
- add `import { homeFor } from './lib/home-for';`;
- replace `HomeRoute` with this exported version:

```tsx
/** SESSION1-COCKPIT-1 §9 - DN roles and SU: DN dashboard; any other
 *  operational role: its work queue (redirect, so ?id= links and the nav
 *  highlight work). */
export function HomeRoute() {
  const { user } = useAuth();
  const home = homeFor(user?.roles ?? []);
  if (home.kind === 'dn_dashboard') return <DashboardPage />;
  if (home.kind === 'queue') return <Navigate to={home.path} replace />;
  return <AccessDenied />;
}
```

- [ ] **Step 5: Navigation**

In `AppShell.tsx`:

- set the « Tableau de bord » item's `roles` to `['dn_agent', 'dn_supervisor', 'SU']`;
- change the `/circuit-directeur-dn` label from `'Courrier DN'` to `'Circuit Directeur DN'`;
- change `'Mes Inspections'` to `'Mes inspections'`.

- [ ] **Step 6: Delete the admin role dashboards**

- Delete the three pages.
- Remove the three fetch functions from `dashboard.api.ts` and the `S5Dashboard*`, `ReceptionDashboard*` and `R3Dashboard*` types from `dashboard.types.ts`.
- Keep every component in `pages/dashboard/components/` that `DashboardPage.tsx` still imports; delete any component that no file imports any more (check with `rg -l "<ComponentName>" apps/admin/src`).

- [ ] **Step 7: Run the tests and typecheck**

Run (from `apps/admin`): `npx vitest run`, then `npm run typecheck --workspace=apps/admin`.
Expected: PASS. If an existing test asserted the old nav label « Courrier DN » or « Mes Inspections », update it to the new label.

---

### Task 4: Courrier queue read model (API) and batched thresholds

**Files:**

- Modify: `apps/api/src/modules/system-parameters/system-parameters.service.ts` (add `getIntegerValues`)
- Create: `apps/api/src/modules/operational/thresholds.ts`, `apps/api/src/modules/operational/aging.ts`
- Modify: `apps/api/src/modules/dashboard/dashboard.service.ts:92-102` (import `DASHBOARD_SLA_DEFAULTS` from `operational/thresholds.ts` instead of declaring it)
- Modify: `apps/api/src/modules/courrier-tasks/courrier-tasks.types.ts`, `courrier-tasks.service.ts` (`loadTaskContext`, `buildTaskView`, `listCourrierTasks`, `inBucket` removed)
- Test: `apps/api/src/modules/operational/thresholds.db.test.ts`, `apps/api/src/modules/courrier-tasks/courrier-queue.db.test.ts`
- Update: `apps/api/src/modules/courrier-tasks/courrier-tasks.db.test.ts`, `apps/api/src/modules/requests/closed-dossier-lists.db.test.ts` (courrier lines only), `apps/api/src/modules/dn-annotation/dn-annotation.db.test.ts:295-304`

**Interfaces:**

- Consumes: Task 1 exports.
- Produces:
  - `getIntegerValues<K extends string>(fallbacks: Record<K, number>): Promise<Record<K, number>>` (one query).
  - `THRESHOLD_KEYS`, `type ThresholdName = 'signatureDepositDays' | 'invoiceUploadDays' | 'paymentValidationDays' | 'dgAlertWorkingDays'`, `loadThresholds<N extends ThresholdName>(names: readonly N[]): Promise<Record<N, number>>`, `DASHBOARD_SLA_DEFAULTS`.
  - `calendarDaysSince(since: Date | null, now: Date): number | null`.
  - `CourrierQueueItem`, `CourrierQueueResponse`, `type CourrierCircuitStep = 'deposited' | 'with_dg' | 'returned' | 'legacy_signed'`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/operational/thresholds.db.test.ts`:

```ts
/** SESSION1-COCKPIT-1 - batched parameter read: one query, fallbacks for
 *  missing or non-numeric values. Real PostgreSQL (skipped without DATABASE_URL). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('getIntegerValues / loadThresholds (real PostgreSQL)', { skip }, () => {
  let params: typeof import('../system-parameters/system-parameters.service.js');
  let thresholds: typeof import('./thresholds.js');
  let appPool: pg.Pool;
  let close: () => Promise<void>;

  before(async () => {
    params = await import('../system-parameters/system-parameters.service.js');
    thresholds = await import('./thresholds.js');
    const dbModule = await import('../../shared/db/index.js');
    appPool = dbModule.db.$client as pg.Pool;
    close = () => dbModule.db.$client.end();
  });
  after(async () => close());

  async function countQueries<T>(run: () => Promise<T>): Promise<{ count: number; value: T }> {
    const original = appPool.query.bind(appPool);
    let count = 0;
    (appPool as unknown as { query: unknown }).query = (...args: unknown[]) => {
      count += 1;
      return (original as (...a: unknown[]) => unknown)(...args);
    };
    try {
      const value = await run();
      return { count, value };
    } finally {
      (appPool as unknown as { query: unknown }).query = original;
    }
  }

  it('reads several keys in one query and falls back for unknown keys', async () => {
    let count = 0;
    const original = appPool.query.bind(appPool);
    (appPool as unknown as { query: unknown }).query = (...args: unknown[]) => {
      count += 1;
      return (original as (...a: unknown[]) => unknown)(...args);
    };
    try {
      const values = await params.getIntegerValues({
        'cockpit-test-missing-key': 7,
        dg_circuit_alert_days: 3,
      });
      assert.equal(values['cockpit-test-missing-key'], 7);
      assert.equal(typeof values.dg_circuit_alert_days, 'number');
    } finally {
      (appPool as unknown as { query: unknown }).query = original;
    }
    assert.equal(count, 1);
  });

  it('loadThresholds returns the named thresholds', async () => {
    const { value } = await countQueries(() =>
      thresholds.loadThresholds(['invoiceUploadDays', 'paymentValidationDays'])
    );
    assert.deepEqual(Object.keys(value).sort(), ['invoiceUploadDays', 'paymentValidationDays']);
  });
});
```

`apps/api/src/modules/courrier-tasks/courrier-queue.db.test.ts` follows the fixture style of `courrier-tasks.db.test.ts`: copy its `before`/`after`, `one`, user/request/phase/circuit helpers verbatim, and add:

```ts
describe('SESSION1-COCKPIT-1 courrier queue (real PostgreSQL)', { skip }, () => {
  // ... fixtures copied from courrier-tasks.db.test.ts (circuit(entityType, status, { requestStatus, phaseStatus, depositedAt, signatureSentAt }))

  const find = async (requestId: number) =>
    (await service.listCourrierTasks({})).items.find((item) => item.requestId === requestId)!;

  it('submitted, phase open: to_print / action_required / Réception / print_for_dg', async () => {
    const d = await circuit('formal_request_letter', 'submitted');
    const item = await find(d.request);
    assert.equal(item.bucket, 'to_print');
    assert.equal(item.state, 'action_required');
    assert.deepEqual(item.owner, OPERATIONAL_OWNERS.reception);
    assert.equal(item.actionKey, 'print_for_dg');
    assert.equal(item.blockReason, null);
    assert.equal(item.circuitStep, 'deposited');
  });

  it('submitted for 3 calendar days with the default 1-day deposit target: overdue', async () => {
    const d = await circuit('intake_request', 'submitted', {
      depositedAt: new Date(Date.now() - 3 * 86_400_000),
    });
    assert.equal((await find(d.request)).urgency, 'overdue');
  });

  it('in signature: with_dg / waiting / Assistant DG / record_dg_annotation; late = overdue', async () => {
    const d = await circuit('formal_request_letter', 'in_signature_circuit', {
      signatureSentAt: new Date(Date.now() - 20 * 86_400_000),
    });
    const item = await find(d.request);
    assert.equal(item.bucket, 'with_dg');
    assert.equal(item.state, 'waiting');
    assert.deepEqual(item.owner, OPERATIONAL_OWNERS.assistantDg);
    assert.equal(item.actionKey, 'record_dg_annotation');
    assert.equal(item.signatureLate, true);
    assert.equal(item.urgency, 'overdue');
  });

  it('B6: a returned initial request is handed to the Assistante DN; a returned letter to the DN', async () => {
    const intake = await circuit('intake_request', 'pending_review');
    const letter = await circuit('formal_request_letter', 'pending_review');
    const a = await find(intake.request);
    const b = await find(letter.request);
    assert.deepEqual(
      [a.bucket, a.state, a.owner, a.actionKey],
      ['returned', 'done', null, 'handed_to_assistant_dn']
    );
    assert.deepEqual([b.bucket, b.actionKey], ['returned', 'handed_to_dn']);
  });

  it('B1: pending on a closed dossier is inactive (in items), never in an action bucket count', async () => {
    const before = (await service.listCourrierTasks({})).counts;
    const d = await circuit('formal_request_letter', 'submitted', { requestStatus: 'rejected' });
    const list = await service.listCourrierTasks({});
    const item = list.items.find((i) => i.requestId === d.request)!;
    assert.deepEqual(
      [item.bucket, item.state, item.owner, item.actionKey, item.blockReason],
      ['inactive', 'done', null, 'none', 'dossier_closed']
    );
    assert.equal(list.counts.to_print, before.to_print);
    assert.equal(list.counts.with_dg, before.with_dg);
  });

  it('phase not open: inactive / blocked / owner DN / phase_not_open', async () => {
    const d = await circuit('formal_request_letter', 'submitted', { phaseStatus: 'closed' });
    const item = await find(d.request);
    assert.deepEqual(
      [item.bucket, item.state, item.owner, item.blockReason],
      ['inactive', 'blocked', OPERATIONAL_OWNERS.dn, 'phase_not_open']
    );
  });

  it('legacy signed: inactive / done', async () => {
    const d = await circuit('formal_request_letter', 'signed');
    const item = await find(d.request);
    assert.deepEqual(
      [item.bucket, item.state, item.circuitStep],
      ['inactive', 'done', 'legacy_signed']
    );
  });

  it('every bucket key is present; thresholds are returned; no French label', async () => {
    const list = await service.listCourrierTasks({});
    assert.deepEqual(Object.keys(list.counts).sort(), [
      'inactive',
      'returned',
      'to_print',
      'with_dg',
    ]);
    assert.equal(typeof list.thresholds.dgAlertWorkingDays, 'number');
    assert.equal(typeof list.thresholds.depositDays, 'number');
    assert.equal('statusLabel' in list.items[0], false);
  });

  it('issues exactly 6 queries whatever the number of courriers', async () => {
    // countQueries as in operational/thresholds.db.test.ts
    await circuit('formal_request_letter', 'submitted');
    const first = await countQueries(() => service.listCourrierTasks({}));
    for (let i = 0; i < 3; i += 1) await circuit('pre_evaluation', 'submitted');
    const second = await countQueries(() => service.listCourrierTasks({}));
    assert.equal(first.count, 6);
    assert.equal(second.count, 6);
  });
});
```

Import `OPERATIONAL_OWNERS` from `@aidn/shared`. If `courrier-tasks.db.test.ts` has no `circuit(...)` helper with these options, write one in the new file: insert `organisations`, `applicants`, `requests` (`status` default `'in_progress'`), `phases` (`M3` for `pre_evaluation`, `M4` for `formal_request_letter`, `status` default `'open'`), then `dg_circuit_documents (request_id, entity_type, status, deposited_at, signature_sent_at, signed_at, pending_review_at)`. Return `{ request }`.

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/api`, with `DATABASE_URL`): `npx tsx --test --test-concurrency=1 src/modules/operational/thresholds.db.test.ts src/modules/courrier-tasks/courrier-queue.db.test.ts`
Expected: FAIL (`getIntegerValues` and the new fields are missing).

- [ ] **Step 3: `getIntegerValues`**

Append to `system-parameters.service.ts` (add `inArray` to the `drizzle-orm` import):

```ts
/** SESSION1-COCKPIT-1 - several integer parameters in ONE query; missing or
 *  non-numeric values fall back, same rule as getIntegerValue. */
export async function getIntegerValues<K extends string>(
  fallbacks: Record<K, number>
): Promise<Record<K, number>> {
  const keys = Object.keys(fallbacks) as K[];
  const rows =
    keys.length === 0
      ? []
      : await db
          .select({ key: systemParameters.key, value: systemParameters.value })
          .from(systemParameters)
          .where(inArray(systemParameters.key, keys));
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const out = {} as Record<K, number>;
  for (const key of keys) {
    const raw = byKey.get(key);
    const n = raw === undefined ? NaN : parseInt(raw, 10);
    out[key] = Number.isNaN(n) ? fallbacks[key] : n;
  }
  return out;
}
```

- [ ] **Step 4: Thresholds and aging modules**

`apps/api/src/modules/operational/thresholds.ts`:

```ts
/** SESSION1-COCKPIT-1 §6 - the existing urgency parameters, read in one query.
 *  DASHBOARD_SLA_DEFAULTS moved here unchanged (the DN dashboard imports it). */
import { getIntegerValues } from '../system-parameters/system-parameters.service.js';

export const DASHBOARD_SLA_DEFAULTS = {
  phaseM3Days: 15,
  phaseM4Days: 20,
  phaseM5Days: 30,
  phaseM6Days: 30,
  phaseM7Days: 10,
  signatureDepositDays: 1,
  invoiceUploadDays: 2,
  paymentValidationDays: 1,
  documentEvaluationDays: 2,
};

/** Same key and default as the Circuit DG alert job. */
export const DG_CIRCUIT_ALERT_DAYS_DEFAULT = 3;

export const THRESHOLD_KEYS = {
  signatureDepositDays: 'dashboard_sla_signature_deposit_days',
  invoiceUploadDays: 'dashboard_sla_invoice_upload_days',
  paymentValidationDays: 'dashboard_sla_payment_validation_days',
  dgAlertWorkingDays: 'dg_circuit_alert_days',
} as const;
export type ThresholdName = keyof typeof THRESHOLD_KEYS;

const DEFAULTS: Record<ThresholdName, number> = {
  signatureDepositDays: DASHBOARD_SLA_DEFAULTS.signatureDepositDays,
  invoiceUploadDays: DASHBOARD_SLA_DEFAULTS.invoiceUploadDays,
  paymentValidationDays: DASHBOARD_SLA_DEFAULTS.paymentValidationDays,
  dgAlertWorkingDays: DG_CIRCUIT_ALERT_DAYS_DEFAULT,
};

export async function loadThresholds<N extends ThresholdName>(
  names: readonly N[]
): Promise<Record<N, number>> {
  const fallbacks = Object.fromEntries(
    names.map((name) => [THRESHOLD_KEYS[name], DEFAULTS[name]])
  ) as Record<string, number>;
  const values = await getIntegerValues(fallbacks);
  return Object.fromEntries(names.map((name) => [name, values[THRESHOLD_KEYS[name]]])) as Record<
    N,
    number
  >;
}
```

`apps/api/src/modules/operational/aging.ts`:

```ts
/** Calendar days elapsed (1 decimal), the dashboard's daysBetween rule; null
 *  without a date or for a date in the future. */
export function calendarDaysSince(since: Date | null, now: Date): number | null {
  if (!since) return null;
  const diff = now.getTime() - since.getTime();
  if (Number.isNaN(diff) || diff < 0) return null;
  return Math.round((diff / 86_400_000) * 10) / 10;
}

export function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
```

In `dashboard.service.ts`, delete the local `DASHBOARD_SLA_DEFAULTS` declaration (lines 92-102) and add `import { DASHBOARD_SLA_DEFAULTS } from '../operational/thresholds.js';`.

- [ ] **Step 5: Courrier types**

Replace `courrier-tasks.types.ts` with:

```ts
import type {
  CourrierActionKey,
  CourrierBucket,
  OperationalQueue,
  OperationalQueueItem,
} from '@aidn/shared';

export type CourrierTaskSource = 'intake_request' | 'formal_request_letter' | 'pre_evaluation';
export type CourrierTaskAction = 'print' | 'confirm_signature_circuit' | 'upload_signed_return';
/** The DG circuit step, for the stepper (the former `bucket` values). */
export type CourrierCircuitStep = 'deposited' | 'with_dg' | 'returned' | 'legacy_signed';

export interface CourrierQueueItem extends OperationalQueueItem<CourrierBucket, CourrierActionKey> {
  source: CourrierTaskSource;
  requestType: string;
  applicantName: string;
  circuitDocumentId: number;
  circuitStatus: string;
  circuitStep: CourrierCircuitStep;
  fileUrl: string | null;
  mimeType: string | null;
  depositedAt: Date;
  signatureSentAt: Date | null;
  signedAt: Date | null;
  pendingReviewAt: Date | null;
  /** Empty on a closed dossier or a phase that is not open (the API would refuse). */
  availableActions: CourrierTaskAction[];
  /** Whole working days in the DG circuit (null outside it). */
  signatureWorkingDays: number | null;
  /** Exactly the Circuit DG alert job's cutoff. */
  signatureLate: boolean;
}

export interface CourrierQueueResponse extends OperationalQueue<CourrierQueueItem, CourrierBucket> {
  thresholds: { dgAlertWorkingDays: number; depositDays: number };
}

/** @deprecated name kept for the mutation responses' callers. */
export type CourrierTaskView = CourrierQueueItem;
```

- [ ] **Step 6: Courrier service**

In `courrier-tasks.service.ts`:

1. **Context.** In `TaskContext`, replace `alertDays: number` with `thresholds: { dgAlertWorkingDays: number; depositDays: number }`. In `loadTaskContext`, replace `getIntegerValue(DG_CIRCUIT_ALERT_DAYS_KEY, DG_CIRCUIT_ALERT_DAYS_DEFAULT)` with `loadThresholds(['dgAlertWorkingDays', 'signatureDepositDays'])`, and set:

   ```ts
   thresholds: { dgAlertWorkingDays: limits.dgAlertWorkingDays, depositDays: limits.signatureDepositDays }
   ```

   (`limits` is the destructured result.) Remove the two local `DG_CIRCUIT_ALERT_DAYS_*` constants and the `getIntegerValue` import if now unused.

2. **Build function.** Replace `bucketForStatus` and `buildTaskView` with:

```ts
function circuitStepFor(status: string): CourrierCircuitStep {
  if (status === 'in_signature_circuit') return 'with_dg';
  if (status === 'pending_review') return 'returned';
  if (status === 'signed') return 'legacy_signed';
  return 'deposited';
}

function stepSinceOf(row: typeof dgCircuitDocuments.$inferSelect): Date {
  if (row.status === 'in_signature_circuit') return row.signatureSentAt ?? row.depositedAt;
  if (row.status === 'pending_review')
    return row.pendingReviewAt ?? row.signedAt ?? row.depositedAt;
  if (row.status === 'signed') return row.signedAt ?? row.pendingReviewAt ?? row.depositedAt;
  return row.depositedAt;
}

type Operational = Pick<
  CourrierQueueItem,
  'bucket' | 'state' | 'owner' | 'actionKey' | 'blockReason' | 'urgency'
>;

function buildTaskView(
  row: typeof dgCircuitDocuments.$inferSelect,
  ctx: TaskContext
): CourrierQueueItem | null {
  const request = ctx.requestsById.get(row.requestId);
  if (!request) return null;
  const currentDocument = ctx.documentsByCircuitId.get(row.id);
  const flags = dossierFlags(request.status);
  const statusActions = actionsForStatus(row.status);
  const pending = statusActions.length > 0;
  const phaseCode = phaseCodeFor(row.entityType);
  const phaseBlocked =
    !flags.dossierClosed &&
    pending &&
    phaseCode !== null &&
    !ctx.openPhases.has(`${row.requestId}:${phaseCode}`);
  const inSignature = row.status === 'in_signature_circuit' && row.signatureSentAt !== null;
  const signatureWorkingDays = inSignature
    ? Math.floor(workingDaysBetween(row.signatureSentAt!, ctx.now, ctx.holidays))
    : null;
  const signatureLate =
    inSignature &&
    row.signatureSentAt! <
      subtractWorkingDays(ctx.now, ctx.thresholds.dgAlertWorkingDays, ctx.holidays);

  const inactive = (
    state: Operational['state'],
    owner: Operational['owner'],
    blockReason: Operational['blockReason']
  ): Operational => ({
    bucket: 'inactive',
    state,
    owner,
    actionKey: 'none',
    blockReason,
    urgency: 'normal',
  });
  let op: Operational;
  if (pending && flags.dossierClosed) op = inactive('done', null, 'dossier_closed');
  else if (phaseBlocked) op = inactive('blocked', OPERATIONAL_OWNERS.dn, 'phase_not_open');
  else if (row.status === 'submitted') {
    op = {
      bucket: 'to_print',
      state: 'action_required',
      owner: OPERATIONAL_OWNERS.reception,
      actionKey: 'print_for_dg',
      blockReason: null,
      urgency: urgencyFromAge(
        calendarDaysSince(row.depositedAt, ctx.now),
        ctx.thresholds.depositDays
      ),
    };
  } else if (row.status === 'in_signature_circuit') {
    // Overdue is exactly the alert job's cutoff; the step before it is the warning.
    const byAge = urgencyFromAge(signatureWorkingDays, ctx.thresholds.dgAlertWorkingDays);
    op = {
      bucket: 'with_dg',
      state: 'waiting',
      owner: OPERATIONAL_OWNERS.assistantDg,
      actionKey: 'record_dg_annotation',
      blockReason: null,
      urgency: signatureLate ? 'overdue' : byAge === 'normal' ? 'normal' : 'warning',
    };
  } else if (row.status === 'pending_review') {
    op = {
      bucket: 'returned',
      state: 'done',
      owner: null,
      blockReason: null,
      urgency: 'normal',
      // B6 - since M1-1 an initial request goes to the Assistante DN (Circuit Directeur DN).
      actionKey: row.entityType === 'intake_request' ? 'handed_to_assistant_dn' : 'handed_to_dn',
    };
  } else op = inactive('done', null, null); // legacy `signed` or an unknown status: history

  return {
    id: `${row.entityType}:${row.requestId}`,
    requestId: row.requestId,
    requestReference: request.reference,
    organisationName: request.organisationName ?? '-',
    ...op,
    stepSince: stepSinceOf(row).toISOString(),
    dueAt: null,
    ...flags,
    source: row.entityType as CourrierTaskSource,
    requestType: request.requestType,
    applicantName: request.applicantName ?? '-',
    circuitDocumentId: row.id,
    circuitStatus: row.status,
    circuitStep: circuitStepFor(row.status),
    fileUrl: currentDocument?.fileUrl ?? null,
    mimeType: currentDocument?.mimeType ?? null,
    depositedAt: row.depositedAt,
    signatureSentAt: row.signatureSentAt,
    signedAt: row.signedAt,
    pendingReviewAt: row.pendingReviewAt,
    availableActions: flags.dossierClosed || phaseBlocked ? [] : statusActions,
    signatureWorkingDays,
    signatureLate,
  };
}
```

3. **List function.** Delete `ACTION_BUCKETS` and `inBucket`. `listCourrierTasks` ends with:

```ts
const items = filters.bucket ? tasks.filter((task) => task.bucket === filters.bucket) : tasks;
return {
  items,
  counts: countBuckets(COURRIER_BUCKETS, tasks),
  thresholds: ctx.thresholds,
};
```

Its return type becomes `Promise<CourrierQueueResponse>`. Imports to add: `COURRIER_BUCKETS`, `OPERATIONAL_OWNERS`, `countBuckets`, `urgencyFromAge` from `@aidn/shared`; `loadThresholds` from `../operational/thresholds.js`; `calendarDaysSince` from `../operational/aging.js`; `CourrierCircuitStep` and `CourrierQueueItem`/`CourrierQueueResponse` from the types file. Mutation functions keep returning `buildTaskView(...)`.

- [ ] **Step 7: Update the existing tests that used the old fields**

- **`courrier-tasks.db.test.ts`:**
  - `listCourrierTasks({ bucket: 'to_signature' })` → `{ bucket: 'to_print' }`;
  - `all.counts.toSignature` → `all.counts.to_print`;
  - `actionBlockedReason` → `blockReason`;
  - an expected `bucket: 'to_signature'` → `'to_print'`, or `'inactive'` when the test sets a closed phase;
  - `signatureAlertDays` → `thresholds.dgAlertWorkingDays`.
- **`closed-dossier-lists.db.test.ts`:**
  - line 95: `assert.equal(l.courrier.bucket, 'inactive');` (a pending courrier on a closed dossier);
  - line 106: `listCourrierTasks({ bucket: 'to_print' })`;
  - the open-dossier case expects `'to_print'`.
- **`dn-annotation.db.test.ts`** « the courrier inbox never lists the Directeur DN circuit »: keep it; it calls `listCourrierTasks({})` and still holds.

- [ ] **Step 8: Run the tests**

Run (from `apps/api`, with `DATABASE_URL`): `npx tsx --test --test-concurrency=1 src/modules/operational/thresholds.db.test.ts src/modules/courrier-tasks/courrier-queue.db.test.ts src/modules/courrier-tasks/courrier-tasks.db.test.ts src/modules/requests/closed-dossier-lists.db.test.ts src/modules/dn-annotation/dn-annotation.db.test.ts`
Expected: PASS. Then `npm run typecheck --workspace=apps/api`. Expected: PASS. The DG alert job still uses `getIntegerValue('dg_circuit_alert_days', 3)` and is untouched.

---

### Task 5: Courriers cockpit (admin) and DG-circuit wording

**Files:**

- Modify: `apps/admin/src/lib/api/courrier-tasks/types.ts`, `api.ts` (types mirror Task 4; dates as ISO strings)
- Modify: `apps/admin/src/lib/react-query/queryKeys.ts` (add `courrierTasks: { all: ['courrierTasks'], queue: () => ['courrierTasks', 'queue'] }`), `queryClient.ts` (`DOSSIER_WORK_LISTS` gains `queryKeys.courrierTasks.queue()`)
- Create: `apps/admin/src/pages/courrier-tasks/courrierCopy.ts` (replaces `courrierBuckets.ts`)
- Delete: `apps/admin/src/pages/courrier-tasks/courrierBuckets.ts`, `courrierBuckets.test.ts`
- Rewrite: `CourrierTasksPage.tsx`, `CourrierReadingPane.tsx`, `CourriersList.tsx` (now a row renderer)
- Modify: `apps/api/src/modules/requests/cockpit-next-action.ts` (the two « circuit de signature du DG » sentences, D7) and the assertions on them in `cockpit-next-action.test.ts`, `requests-cockpit.db.test.ts`
- Test: `apps/admin/src/pages/courrier-tasks/courrierCopy.test.ts`, rewrite `CourrierTasksPage.test.tsx`; update `apps/admin/src/pages/closed-dossier-lists.test.tsx` (`<CourrierTasksPage>` block)

**Interfaces:**

- Consumes:
  - Task 1 keys;
  - Task 2 primitives (`CockpitPage`, `QueueColumn`, `QueueReadingPane`, `QueueEmptyPane`, `AgingBadge`, `CockpitUploadModal`, `sortQueue`, `groupQueue`, `filterQueue`, `defaultOrderFor`, `useUrlSelection`, `useQueueTab`);
  - Task 3 `courrierDefaultTab`;
  - UX-1 `canAct` (`lib/next-action-owner.ts`).
- Produces: `COURRIER_TABS`, `CourrierTab`, `courrierCallout(item, thresholds)`, `courrierMetrics(items, counts, now?)`, `courrierRowLabel(item)`, `SOURCE_LABELS`, `REQUEST_TYPE_LABELS` (moved from `courrierBuckets.ts`; `CircuitDirecteurDnPage` imports `REQUEST_TYPE_LABELS`; update that import path in Task 6).

- [ ] **Step 1: Write the failing tests**

`apps/admin/src/pages/courrier-tasks/courrierCopy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { OPERATIONAL_OWNERS } from '@aidn/shared';
import type { CourrierTask } from '../../lib/api/courrier-tasks';
import { courrierCallout, courrierMetrics } from './courrierCopy';

export const courrier = (over: Partial<CourrierTask> = {}): CourrierTask => ({
  id: 'formal_request_letter:1',
  requestId: 1,
  requestReference: 'DEM-1',
  organisationName: 'OMA 1',
  bucket: 'to_print',
  state: 'action_required',
  owner: OPERATIONAL_OWNERS.reception,
  actionKey: 'print_for_dg',
  blockReason: null,
  urgency: 'normal',
  stepSince: '2026-10-15T09:00:00.000Z',
  dueAt: null,
  dossierClosed: false,
  dossierStatus: 'in_progress',
  source: 'formal_request_letter',
  requestType: 'issuance',
  applicantName: 'Jean',
  circuitDocumentId: 1,
  circuitStatus: 'submitted',
  circuitStep: 'deposited',
  fileUrl: '/api/files/1',
  mimeType: 'application/pdf',
  depositedAt: '2026-10-15T09:00:00.000Z',
  signatureSentAt: null,
  signedAt: null,
  pendingReviewAt: null,
  availableActions: ['print', 'confirm_signature_circuit'],
  signatureWorkingDays: null,
  signatureLate: false,
  ...over,
});
const T = { dgAlertWorkingDays: 3, depositDays: 1 };

describe('courrierCallout (D7 wording)', () => {
  it('print / DG annotation / B6 hand-over / phase blocked / closed', () => {
    expect(courrierCallout(courrier(), T).title).toBe('Impression et mise en circuit DG');
    const dg = courrierCallout(
      courrier({ actionKey: 'record_dg_annotation', bucket: 'with_dg', signatureWorkingDays: 2 }),
      T
    );
    expect(dg.title).toBe('Annotation du DG attendue');
    expect(dg.description).toBe(
      'En circuit DG depuis 2 j ouvrés (alerte au-delà de 3). Scannez le retour annoté dès réception.'
    );
    expect(
      courrierCallout(courrier({ actionKey: 'handed_to_assistant_dn', bucket: 'returned' }), T)
        .description
    ).toBe("Le dossier est transmis à l'Assistante DN pour le circuit Directeur DN.");
    expect(
      courrierCallout(courrier({ actionKey: 'handed_to_dn', bucket: 'returned' }), T).description
    ).toBe('Le document est transmis à la DN.');
    expect(
      courrierCallout(
        courrier({
          bucket: 'inactive',
          actionKey: 'none',
          blockReason: 'phase_not_open',
          source: 'pre_evaluation',
        }),
        T
      ).blockReason
    ).toBe("La phase M3 n'est pas ouverte : aucune action du circuit possible.");
    expect(
      courrierCallout(
        courrier({
          bucket: 'inactive',
          actionKey: 'none',
          blockReason: 'dossier_closed',
          dossierClosed: true,
        }),
        T
      ).title
    ).toBe('Dossier clos - consultation uniquement');
  });
  it('never says « signature »', () => {
    for (const actionKey of [
      'print_for_dg',
      'record_dg_annotation',
      'handed_to_assistant_dn',
      'handed_to_dn',
    ] as const) {
      const copy = courrierCallout(courrier({ actionKey }), T);
      expect(`${copy.title} ${copy.description}`).not.toMatch(/sign/i);
    }
  });
});

describe('courrierMetrics', () => {
  it('reads the action buckets only (never counts.inactive) and the rows for « 30 j »', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    const items = [
      courrier({ urgency: 'overdue' }),
      courrier({
        id: 'b',
        bucket: 'with_dg',
        actionKey: 'record_dg_annotation',
        signatureWorkingDays: 4,
        urgency: 'overdue',
      }),
      courrier({
        id: 'c',
        bucket: 'returned',
        actionKey: 'handed_to_dn',
        pendingReviewAt: '2026-10-10T09:00:00Z',
      }),
      courrier({
        id: 'd',
        bucket: 'returned',
        actionKey: 'handed_to_dn',
        pendingReviewAt: '2026-08-01T09:00:00Z',
      }),
      courrier({ id: 'e', bucket: 'inactive', actionKey: 'none', blockReason: 'dossier_closed' }),
    ];
    const counts = { to_print: 1, with_dg: 1, returned: 2, inactive: 1 };
    expect(courrierMetrics(items, counts, now)).toEqual([
      { key: 'to_print', label: 'à imprimer', value: 1, detail: 'dont 1 en retard', tone: 'info' },
      {
        key: 'with_dg',
        label: 'retour DG attendu',
        value: 1,
        detail: 'dont 1 en retard · délai moyen 4 j ouvrés',
        tone: 'warning',
      },
      {
        key: 'returned_30',
        label: 'retours enregistrés (30 j)',
        value: 1,
        detail: null,
        tone: 'success',
      },
    ]);
  });
});
```

Rewrite `CourrierTasksPage.test.tsx`. Keep its auth mock but make the roles mutable:

```ts
let roles = ['reception'];
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles } }) }));
```

Build fixtures with the `courrier(...)` factory (import it from `./courrierCopy.test`, or copy it). Seed through `api.get` mocked to resolve `{ data: { items, counts, thresholds: { dgAlertWorkingDays: 3, depositDays: 1 } } }`. Cover these cases:

```tsx
it('Réception lands on « À imprimer »; Assistant DG alone on « Retour DG attendu »', async () => {
  roles = ['reception'];
  renderPage();
  expect(
    await screen.findByRole('tab', { name: /À imprimer/, selected: true })
  ).toBeInTheDocument();
  cleanup();
  roles = ['assistant_dg'];
  renderPage();
  expect(
    await screen.findByRole('tab', { name: /Retour DG attendu/, selected: true })
  ).toBeInTheDocument();
});

it('callout: owner named, CTA « Ouvrir / imprimer » for Réception', async () => {
  roles = ['reception'];
  renderPage();
  const pane = await screen.findByRole('article', { name: /Détail du courrier DEM-C2-01/ });
  expect(within(pane).getByText('Responsable :')).toBeInTheDocument();
  expect(within(pane).getByRole('button', { name: /Ouvrir \/ imprimer/ })).toBeInTheDocument();
  expect(within(pane).getByRole('button', { name: /Voir le document/ })).toBeInTheDocument();
});

it('a role that cannot act gets no CTA but keeps the secondary links', async () => {
  roles = ['dn_agent'];
  renderPage();
  const pane = await screen.findByRole('article', { name: /Détail du courrier/ });
  expect(
    within(pane).queryByRole('button', { name: /Ouvrir \/ imprimer/ })
  ).not.toBeInTheDocument();
  expect(within(pane).getByRole('button', { name: /Voir le document/ })).toBeInTheDocument();
  expect(within(pane).getByRole('link', { name: /Voir le dossier/ })).toBeInTheDocument();
});

it('« Tous » shows an inactive (closed) courrier with its badge and no CTA; action tabs never count it', async () => {
  /* items incl. one bucket:'inactive' dossierClosed */
});

it('Entrée on a row focuses the action button, never prints', async () => {
  /* as in the current test */
});

it('« Retour DG attendu » groups a normal item under « En attente », never « À traiter »', async () => {
  /* ?tab=with_dg, one normal with_dg item */
});

it('DOSSIER_CLOSED during « Impression OK »: the list reloads and the API message is shown', async () => {
  // api.post rejects with an AxiosError(409, code DOSSIER_CLOSED); the second api.get returns the row as inactive
});
```

`renderPage` = `renderWithProviders(<CourrierTasksPage />, { route: '/courriers' })`. Each test resets `roles` in `beforeEach`.

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/admin`): `npx vitest run src/pages/courrier-tasks`
Expected: FAIL (`courrierCopy` missing; the page has old fields).

- [ ] **Step 3: Admin types and client**

Replace `lib/api/courrier-tasks/types.ts`:

```ts
import type {
  CourrierActionKey,
  CourrierBucket,
  OperationalQueue,
  OperationalQueueItem,
} from '@aidn/shared';

export type CourrierTaskSource = 'intake_request' | 'formal_request_letter' | 'pre_evaluation';
export type CourrierTaskAction = 'print' | 'confirm_signature_circuit' | 'upload_signed_return';
export type CourrierCircuitStep = 'deposited' | 'with_dg' | 'returned' | 'legacy_signed';

export interface CourrierTask extends OperationalQueueItem<CourrierBucket, CourrierActionKey> {
  source: CourrierTaskSource;
  requestType: string;
  applicantName: string;
  circuitDocumentId: number;
  circuitStatus: string;
  circuitStep: CourrierCircuitStep;
  fileUrl: string | null;
  mimeType: string | null;
  depositedAt: string;
  signatureSentAt: string | null;
  signedAt: string | null;
  pendingReviewAt: string | null;
  availableActions: CourrierTaskAction[];
  signatureWorkingDays: number | null;
  signatureLate: boolean;
}

export interface CourrierTaskListResponse extends OperationalQueue<CourrierTask, CourrierBucket> {
  thresholds: { dgAlertWorkingDays: number; depositDays: number };
}
```

Keep `api.ts` unchanged, except that `returnSignedCourrier` is renamed `returnAnnotatedCourrier` (same endpoint `/return-signed`; the route name stays).

- [ ] **Step 4: `courrierCopy.ts`**

```ts
/** SESSION1-COCKPIT-1 - Courriers cockpit French, keyed by the API's keys
 *  (D13). D7: « Annotation du DG » for the three reception circuits. */
import type { CourrierBucket } from '@aidn/shared';
import type { CourrierTask } from '../../lib/api/courrier-tasks';
import type { CockpitMetric } from '../../components/cockpit/CockpitMetrics';
import type { QueueMode } from '../../lib/cockpit/queue';

export type CourrierTab = Exclude<CourrierBucket, 'inactive'> | 'all';
export const COURRIER_TABS: Array<{ key: CourrierTab; label: string }> = [
  { key: 'to_print', label: 'À imprimer' },
  { key: 'with_dg', label: 'Retour DG attendu' },
  { key: 'returned', label: 'Retours enregistrés' },
  { key: 'all', label: 'Tous' },
];
/** Approved correction: with_dg waits on the DG (« En attente »), it is not « À traiter ». */
export const COURRIER_TAB_MODES: Record<CourrierTab, QueueMode> = {
  to_print: 'action',
  with_dg: 'waiting',
  returned: 'history',
  all: 'history',
};

export const SOURCE_LABELS: Record<string, string> = {
  intake_request: 'Demande initiale',
  formal_request_letter: 'Lettre formelle',
  pre_evaluation: 'Déclaration de pré-évaluation',
};

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: 'Reconnaissance',
  issuance: 'Délivrance',
  modification: 'Modification',
  renewal: 'Renouvellement',
};

export const STEP_LABELS: Record<CourrierTask['circuitStep'], string> = {
  deposited: 'Déposé',
  with_dg: 'En circuit DG',
  returned: 'Annotation reçue',
  legacy_signed: 'Ancien circuit',
};

export interface CalloutCopy {
  title: string;
  description: string;
  blockReason: string | null;
}

export function courrierCallout(
  item: CourrierTask,
  t: { dgAlertWorkingDays: number }
): CalloutCopy {
  if (item.blockReason === 'dossier_closed') {
    return {
      title: 'Dossier clos - consultation uniquement',
      description:
        'Le courrier et son document restent consultables. Aucune action du circuit DG n’est possible.',
      blockReason: null,
    };
  }
  if (item.blockReason === 'phase_not_open') {
    return {
      title: 'Phase non ouverte',
      description: 'Le courrier attend l’ouverture de sa phase par la DN.',
      blockReason: `La phase ${item.source === 'pre_evaluation' ? 'M3' : 'M4'} n'est pas ouverte : aucune action du circuit possible.`,
    };
  }
  switch (item.actionKey) {
    case 'print_for_dg':
      return {
        title: 'Impression et mise en circuit DG',
        description: 'Imprimez le document puis confirmez sa mise en circuit DG.',
        blockReason: null,
      };
    case 'record_dg_annotation': {
      const since =
        item.signatureWorkingDays === null
          ? ''
          : `En circuit DG depuis ${item.signatureWorkingDays} j ouvrés (alerte au-delà de ${t.dgAlertWorkingDays}). `;
      return {
        title: 'Annotation du DG attendue',
        description: `${since}Scannez le retour annoté dès réception.`,
        blockReason: null,
      };
    }
    case 'handed_to_assistant_dn':
      return {
        title: 'Annotation du DG enregistrée',
        description: "Le dossier est transmis à l'Assistante DN pour le circuit Directeur DN.",
        blockReason: null,
      };
    case 'handed_to_dn':
      return {
        title: 'Annotation du DG enregistrée',
        description: 'Le document est transmis à la DN.',
        blockReason: null,
      };
    default:
      return {
        title: 'Ancien circuit',
        description: 'Courrier archivé, consultation uniquement.',
        blockReason: null,
      };
  }
}

/** One-line label shown on the list row (state + who). */
export function courrierRowLabel(item: CourrierTask): string {
  if (item.blockReason === 'dossier_closed') return 'Dossier clos - consultation';
  if (item.blockReason === 'phase_not_open') return 'Phase non ouverte';
  if (item.actionKey === 'print_for_dg') return 'Imprimer puis mettre en circuit DG';
  if (item.actionKey === 'record_dg_annotation') return 'Annotation du DG attendue';
  if (item.actionKey === 'handed_to_assistant_dn') return "Transmis à l'Assistante DN";
  if (item.actionKey === 'handed_to_dn') return 'Transmis à la DN';
  return 'Ancien circuit';
}

const DAY_MS = 86_400_000;

export function courrierMetrics(
  items: CourrierTask[],
  counts: Record<CourrierBucket, number>,
  now: Date = new Date()
): CockpitMetric[] {
  const late = (bucket: CourrierBucket) =>
    items.filter((item) => item.bucket === bucket && item.urgency === 'overdue').length;
  const waits = items
    .filter((item) => item.bucket === 'with_dg' && item.signatureWorkingDays !== null)
    .map((item) => item.signatureWorkingDays!);
  const average = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null;
  const returned30 = items.filter(
    (item) =>
      item.bucket === 'returned' &&
      item.pendingReviewAt &&
      now.getTime() - new Date(item.pendingReviewAt).getTime() <= 30 * DAY_MS
  ).length;
  const lateDetail = (n: number) => (n > 0 ? `dont ${n} en retard` : null);
  const withDgDetail = [
    lateDetail(late('with_dg')),
    average === null
      ? null
      : `délai moyen ${average.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j ouvrés`,
  ]
    .filter(Boolean)
    .join(' · ');
  return [
    {
      key: 'to_print',
      label: 'à imprimer',
      value: counts.to_print,
      detail: lateDetail(late('to_print')),
      tone: 'info',
    },
    {
      key: 'with_dg',
      label: 'retour DG attendu',
      value: counts.with_dg,
      detail: withDgDetail || null,
      tone: 'warning',
    },
    {
      key: 'returned_30',
      label: 'retours enregistrés (30 j)',
      value: returned30,
      detail: null,
      tone: 'success',
    },
  ];
}
```

- [ ] **Step 5: The page**

Rewrite `CourrierTasksPage.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DocumentViewer from '../../components/documents/DocumentViewer';
import { CockpitPage } from '../../components/cockpit/CockpitPage';
import { QueueColumn } from '../../components/cockpit/QueueColumn';
import { CockpitUploadModal } from '../../components/cockpit/CockpitUploadModal';
import { useAuth } from '../../hooks/useAuth';
import {
  confirmCourrierPrinted,
  fetchCourrierTasks,
  returnAnnotatedCourrier,
  type CourrierTask,
} from '../../lib/api/courrier-tasks';
import { apiErrorMessage } from '../../lib/axios';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { isDossierClosedError } from '../../lib/react-query/queryClient';
import { uploadFile } from '../../lib/uploads';
import { courrierDefaultTab } from '../../lib/home-for';
import {
  defaultOrderFor,
  filterQueue,
  groupQueue,
  sortQueue,
  type AgeOrder,
} from '../../lib/cockpit/queue';
import { useQueueTab } from '../../lib/cockpit/useQueueTab';
import { useUrlSelection } from '../../lib/cockpit/useUrlSelection';
import { CourrierReadingPane } from './CourrierReadingPane';
import { CourrierRow } from './CourriersList';
import {
  COURRIER_TAB_MODES,
  COURRIER_TABS,
  REQUEST_TYPE_LABELS,
  SOURCE_LABELS,
  courrierMetrics,
  type CourrierTab,
} from './courrierCopy';

const EMPTY_COUNTS = { to_print: 0, with_dg: 0, returned: 0, inactive: 0 };

/** SESSION1-COCKPIT-1 - Réception / Assistant DG cockpit (home of both roles):
 *  DG-circuit queue on the shared shell. Actions unchanged: « Ouvrir /
 *  imprimer » opens the viewer whose « Impression OK » confirms; the annotated
 *  return goes through the upload dialog. Entrée only focuses the action. */
export default function CourrierTasksPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.courrierTasks.queue(),
    queryFn: () => fetchCourrierTasks(),
  });
  const items = query.data?.items ?? [];
  const counts = query.data?.counts ?? EMPTY_COUNTS;
  const thresholds = query.data?.thresholds ?? { dgAlertWorkingDays: 3, depositDays: 1 };

  const [tab, setTab] = useQueueTab<CourrierTab>(
    COURRIER_TABS.map((t) => t.key),
    courrierDefaultTab(roles)
  );
  const mode = COURRIER_TAB_MODES[tab];
  const [order, setOrder] = useState<AgeOrder | null>(null);
  const effectiveOrder = order ?? defaultOrderFor(mode);
  const [search, setSearch] = useState('');
  const visible = useMemo(
    () =>
      sortQueue(
        filterQueue(items, tab, search, (item) =>
          [
            item.requestReference,
            item.organisationName,
            item.applicantName,
            SOURCE_LABELS[item.source],
            REQUEST_TYPE_LABELS[item.requestType],
          ].join(' ')
        ),
        mode,
        effectiveOrder
      ),
    [items, tab, search, mode, effectiveOrder]
  );
  const groups = useMemo(() => groupQueue(visible, mode), [visible, mode]);
  const { selected, select } = useUrlSelection(visible, !query.isLoading);

  const [printTask, setPrintTask] = useState<CourrierTask | null>(null);
  const [previewTask, setPreviewTask] = useState<CourrierTask | null>(null);
  const [returnTask, setReturnTask] = useState<CourrierTask | null>(null);
  const [returnFile, setReturnFile] = useState<File | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);

  const reload = () => queryClient.invalidateQueries({ queryKey: queryKeys.courrierTasks.queue() });

  async function run(
    task: CourrierTask,
    action: () => Promise<void>,
    fallback: string,
    close: () => void
  ) {
    setActionError(null);
    setBusyId(task.id);
    try {
      await action();
      close();
      await reload();
    } catch (err) {
      setActionError(apiErrorMessage(err, fallback));
      if (isDossierClosedError(err)) {
        close();
        await reload();
      }
    } finally {
      setBusyId(null);
    }
  }

  const viewerTask = printTask ?? previewTask;
  return (
    <CockpitPage
      title="Courriers - circuit DG"
      metrics={courrierMetrics(items, counts)}
      search={{
        value: search,
        onChange: setSearch,
        placeholder: 'Référence, organisation, postulant, type...',
        label: 'Rechercher un courrier',
      }}
      errors={[
        query.error ? apiErrorMessage(query.error, 'Impossible de charger les courriers.') : null,
        actionError,
      ]}
      list={
        <QueueColumn
          tabs={COURRIER_TABS.map((t) => ({
            key: t.key,
            label: t.label,
            count: t.key === 'all' ? items.length : counts[t.key],
          }))}
          tab={tab}
          onTabChange={(next) => {
            setTab(next);
            setOrder(null);
          }}
          order={effectiveOrder}
          onOrderChange={setOrder}
          groups={groups}
          selectedId={selected?.id ?? null}
          status={query.isLoading ? 'loading' : query.error ? 'error' : 'ready'}
          texts={{
            loading: 'Chargement des courriers',
            error: 'Impossible de charger les courriers.',
            empty: 'Aucun courrier dans cette vue',
            listLabel: 'Courriers',
            noun: ['courrier', 'courriers'],
          }}
          onSelect={(task) => {
            setActionError(null);
            select(task);
          }}
          onActivate={() => {
            const button = actionButtonRef.current;
            if (button && !button.disabled) button.focus();
            else previewButtonRef.current?.focus();
          }}
          renderRow={(task) => <CourrierRow task={task} />}
        />
      }
      pane={
        <CourrierReadingPane
          task={selected}
          roles={roles}
          busy={busyId !== null && busyId === selected?.id}
          thresholds={thresholds}
          actionButtonRef={actionButtonRef}
          previewButtonRef={previewButtonRef}
          onPrint={setPrintTask}
          onPreview={setPreviewTask}
          onReturn={(task) => {
            setReturnTask(task);
            setReturnFile(null);
          }}
        />
      }
    >
      <DocumentViewer
        file={
          viewerTask?.fileUrl
            ? {
                title: `${SOURCE_LABELS[viewerTask.source] ?? viewerTask.source} ${viewerTask.requestReference}`,
                url: viewerTask.fileUrl,
              }
            : null
        }
        onClose={() => {
          setPrintTask(null);
          setPreviewTask(null);
        }}
        primaryActionLabel={
          printTask
            ? busyId === printTask.id
              ? 'Confirmation...'
              : 'Impression OK - mettre en circuit DG'
            : undefined
        }
        primaryActionDisabled={!printTask || busyId !== null}
        actionHint={
          printTask
            ? 'Imprimez le document, vérifiez le contenu, puis confirmez sa mise en circuit DG.'
            : 'Prévisualisation intégrée du document courant.'
        }
        onPrimaryAction={() =>
          printTask &&
          run(
            printTask,
            () => confirmCourrierPrinted(printTask.id),
            'Confirmation impossible.',
            () => setPrintTask(null)
          )
        }
      />
      {returnTask ? (
        <CockpitUploadModal
          title="Scanner le retour annoté"
          subtitle={`${SOURCE_LABELS[returnTask.source] ?? returnTask.source} - ${returnTask.requestReference}`}
          label="Document annoté par le DG"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          submitLabel="Enregistrer le retour"
          busySubmitLabel="Enregistrement..."
          file={returnFile}
          busy={busyId === returnTask.id}
          onFileChange={setReturnFile}
          onClose={() => {
            setReturnTask(null);
            setReturnFile(null);
          }}
          onSubmit={() =>
            returnFile &&
            run(
              returnTask,
              async () =>
                returnAnnotatedCourrier(
                  returnTask.id,
                  (await uploadFile(returnFile)).uploadAssetId
                ),
              'Enregistrement du retour annoté impossible.',
              () => {
                setReturnTask(null);
                setReturnFile(null);
              }
            )
          }
        />
      ) : null}
    </CockpitPage>
  );
}
```

Rewrite `CourriersList.tsx` to export one row renderer:

```tsx
import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { AgingBadge } from '../../components/cockpit/AgingBadge';
import type { CourrierTask } from '../../lib/api/courrier-tasks';
import { formatRowDate } from '../../lib/dayGroups';
import { cn } from '../../lib/utils';
import { SOURCE_LABELS, STEP_LABELS, courrierRowLabel } from './courrierCopy';

/** One list row: organisation and date, reference and source, badges, then
 *  the step and its next action. */
export function CourrierRow({ task }: { task: CourrierTask }) {
  return (
    <>
      <span className="truncate text-sm font-medium text-anac-text">{task.organisationName}</span>
      <span className="whitespace-nowrap text-right text-[11px] text-anac-muted">
        {task.stepSince ? formatRowDate(task.stepSince) : '-'}
      </span>
      <span className="truncate text-xs text-anac-text/80">
        {task.requestReference} · {SOURCE_LABELS[task.source] ?? task.source}
      </span>
      <span className="flex justify-end gap-1.5">
        {task.dossierClosed ? <ClosedDossierBadge status={task.dossierStatus} /> : null}
        {task.bucket === 'to_print' || task.bucket === 'with_dg' ? (
          <AgingBadge
            urgency={task.urgency}
            since={task.stepSince}
            workingDays={task.bucket === 'with_dg' ? task.signatureWorkingDays : null}
          />
        ) : null}
      </span>
      <span className="col-span-2 truncate text-xs">
        <span className="text-anac-muted">{STEP_LABELS[task.circuitStep]} - </span>
        <span
          className={cn(
            'font-semibold',
            task.state === 'action_required'
              ? 'text-anac-blue'
              : task.state === 'waiting'
                ? 'text-anac-warning'
                : 'text-anac-muted'
          )}
        >
          {courrierRowLabel(task)}
        </span>
      </span>
    </>
  );
}
```

Rewrite `CourrierReadingPane.tsx`:

```tsx
import type { ReactNode, RefObject } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Eye, FileText, FileUp, FolderOpen, Printer } from 'lucide-react';
import type { InternalRole } from '@aidn/shared';
import { Button, buttonVariants } from '../../components/ui/button';
import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { QueueEmptyPane, QueueReadingPane } from '../../components/cockpit/QueueReadingPane';
import type { CourrierTask } from '../../lib/api/courrier-tasks';
import { canAct } from '../../lib/next-action-owner';
import { cn } from '../../lib/utils';
import { REQUEST_TYPE_LABELS, SOURCE_LABELS, STEP_LABELS, courrierCallout } from './courrierCopy';

const DN_VIEW_ROLES = ['dn_agent', 'dn_supervisor', 'SU'];

export function CourrierReadingPane({
  task,
  roles,
  busy,
  thresholds,
  actionButtonRef,
  previewButtonRef,
  onPrint,
  onPreview,
  onReturn,
}: {
  task: CourrierTask | null;
  roles: readonly string[];
  busy: boolean;
  thresholds: { dgAlertWorkingDays: number };
  actionButtonRef: RefObject<HTMLButtonElement>;
  previewButtonRef: RefObject<HTMLButtonElement>;
  onPrint: (task: CourrierTask) => void;
  onPreview: (task: CourrierTask) => void;
  onReturn: (task: CourrierTask) => void;
}) {
  if (!task)
    return (
      <QueueEmptyPane
        title="Sélectionnez un courrier"
        description="Le circuit, le document et l'action apparaîtront ici."
      />
    );
  const copy = courrierCallout(task, thresholds);
  const allowed = canAct(task.owner, roles as InternalRole[]);
  const sourceLabel = SOURCE_LABELS[task.source] ?? task.source;
  const cta = task.availableActions.includes('print') ? (
    <Button
      ref={actionButtonRef}
      type="button"
      size="sm"
      disabled={busy || !task.fileUrl}
      onClick={() => onPrint(task)}
    >
      <Printer size={14} aria-hidden="true" /> Ouvrir / imprimer
    </Button>
  ) : task.availableActions.includes('upload_signed_return') ? (
    <Button
      ref={actionButtonRef}
      type="button"
      size="sm"
      disabled={busy}
      onClick={() => onReturn(task)}
    >
      <FileUp size={14} aria-hidden="true" /> Scanner le retour annoté
    </Button>
  ) : undefined;
  const secondary = (
    <>
      {task.fileUrl ? (
        <button
          ref={previewButtonRef}
          type="button"
          onClick={() => onPreview(task)}
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-2')}
        >
          <Eye size={14} aria-hidden="true" /> Voir le document
        </button>
      ) : null}
      {roles.some((role) => DN_VIEW_ROLES.includes(role)) ? (
        <Link
          to={
            task.source === 'formal_request_letter'
              ? `/demandes/${task.requestId}/phase-formelle`
              : `/demandes/${task.requestId}/phase-preliminaire`
          }
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-2')}
        >
          <FolderOpen size={14} aria-hidden="true" /> Voir le dossier
        </Link>
      ) : null}
    </>
  );
  return (
    <QueueReadingPane
      ariaLabel={`Détail du courrier ${task.requestReference}`}
      header={
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <h2 className="text-lg font-semibold text-anac-navy">{task.requestReference}</h2>
            <span className="text-sm text-anac-text/80">
              {sourceLabel} · {REQUEST_TYPE_LABELS[task.requestType] ?? task.requestType}
            </span>
            <span className="ml-auto">
              {task.dossierClosed ? <ClosedDossierBadge status={task.dossierStatus} /> : null}
            </span>
          </div>
          <p className="mt-1.5 text-sm">
            <span className="font-semibold">{task.organisationName}</span>
            <span className="text-anac-muted"> · {task.applicantName}</span>
          </p>
        </>
      }
      callout={{
        state: task.state,
        title: copy.title,
        description: copy.description,
        owner: task.owner,
        canAct: allowed && !!cta,
        cta,
        secondary,
        blockReason: copy.blockReason,
      }}
    >
      <Section title="Circuit DG">
        <CircuitStepper task={task} />
      </Section>
      <Section title="Informations clés">
        <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
          <Info label="Type de courrier" value={sourceLabel} />
          <Info
            label="Nature de demande"
            value={REQUEST_TYPE_LABELS[task.requestType] ?? task.requestType}
          />
          <Info label="Demandeur" value={task.organisationName} />
          <Info label="Postulant" value={task.applicantName} />
        </dl>
      </Section>
    </QueueReadingPane>
  );
}
```

Then:

- **`CircuitStepper`:** move it from the old file and change only its labels, to `'Déposé'`, `'En circuit DG'` (date `signatureSentAt`), `'Annotation reçue'` (date `pendingReviewAt ?? signedAt`) and a last step labelled `task.actionKey === 'handed_to_assistant_dn' ? 'Transmis à l’Assistante DN' : 'Transmis à la DN'`. `current` is driven by `task.circuitStep` (`deposited` → step 1, `with_dg` → step 2) and is false when `task.dossierClosed`.
- **Helpers:** move `Section`, `Info` and `formatDate` unchanged.
- **Imports:** `CheckCircle2` and `FileText` stay imported if the stepper and the document block use them; delete the « Dossier clos » section and the `actionHint` function (the callout replaces them).

- [ ] **Step 6: Wire query keys, delete `courrierBuckets`**

- Add the `courrierTasks` key and its `DOSSIER_WORK_LISTS` entry (see Files).
- Delete `courrierBuckets.ts` and `courrierBuckets.test.ts`.
- Point every importer of `../courrier-tasks/courrierBuckets` (`rg -l courrierBuckets apps/admin/src`) at `courrierCopy`.
- In `closed-dossier-lists.test.tsx`, the `<CourrierTasksPage>` block:
  - seeds `{ items: [...], counts, thresholds }`;
  - the closed case uses `bucket: 'inactive'`, `blockReason: 'dossier_closed'`, `owner: null` and `state: 'done'`, and switches to « Tous » (`?tab=all` route) before asserting the badge and the absence of « Ouvrir / imprimer »;
  - the queryClient test also expects `queryKeys.courrierTasks.queue()`.

- [ ] **Step 7: Cockpit text (D7, wording only)**

In `apps/api/src/modules/requests/cockpit-next-action.ts`, replace:

- `'Le dossier est dans le circuit de signature du DG. La DN le suit en lecture seule.'` → `'Le dossier est dans le circuit DG, en attente de l’annotation du DG. La DN le suit en lecture seule.'`
- `'Le document de la phase est dans le circuit de signature du DG.'` → `'Le document de la phase est dans le circuit DG, en attente de l’annotation du DG.'`

Update the matching assertions (`rg -n "circuit de signature du DG" apps`).

- [ ] **Step 8: Run the tests**

Run (from `apps/admin`): `npx vitest run`. From `apps/api`: `npx tsx --test --test-concurrency=1 src/modules/requests/cockpit-next-action.test.ts` (and `requests-cockpit.db.test.ts` with `DATABASE_URL`).
Expected: PASS. Then `npm run typecheck --workspace=apps/admin`.

---

### Task 6: Circuit Directeur DN queue (API) and cockpit (admin)

**Files:**

- Modify: `apps/api/src/modules/dn-annotation/dn-annotation.types.ts`, `dn-annotation.service.ts` (`buildView`, `listDnAnnotationTasks`; `visibleIn` removed)
- Modify: `apps/api/src/modules/dn-annotation/dn-annotation.db.test.ts` (lines 194-202 and 228-245: `statusLabel` → `actionKey`; closed → `inactive`)
- Test: `apps/api/src/modules/dn-annotation/dn-circuit-queue.db.test.ts`
- Modify: `apps/admin/src/lib/api/dn-annotation/types.ts`; `queryKeys.ts` (`dnCircuit: { all: ['dnCircuit'], queue: () => ['dnCircuit', 'queue'] }`); `queryClient.ts` (`DOSSIER_WORK_LISTS` + `queryKeys.dnCircuit.queue()`)
- Create: `apps/admin/src/pages/dn-annotation/dnCircuitCopy.ts` (replaces `dnAnnotationBuckets.ts`); delete `dnAnnotationBuckets.ts` and `dnAnnotationBuckets.test.ts`
- Rewrite: `apps/admin/src/pages/dn-annotation/CircuitDirecteurDnPage.tsx`, `CircuitDirecteurDnPage.test.tsx`
- Test: `apps/admin/src/pages/dn-annotation/dnCircuitCopy.test.ts`

**Interfaces:**

- Consumes: Tasks 1, 2 and 4 (`calendarDaysSince` is not needed; DN urgency is always `normal`).
- Produces: `DnCircuitQueueItem`, `DnCircuitQueueResponse` (API); admin `DnAnnotationTask` (extends the contract), `DN_CIRCUIT_TABS`, `dnCircuitCallout(item)`, `dnCircuitMetrics(items, counts, now?)`.

- [ ] **Step 1: Write the failing API test**

`dn-circuit-queue.db.test.ts` reuses `dn-annotation.db.test.ts`'s fixture `dossierInDgCircuit` (copy it with its helpers) and `m.dn` (the service module):

```ts
it('submitted: to_send / action_required / Assistante DN / send_to_director, urgency normal', async () => {
  const d = await dossierInDgCircuit();
  await returnDg(d); // the DG return creates the DN circuit (same helper as the existing test)
  const item = (await m.dn.listDnAnnotationTasks({})).items.find((i) => i.requestId === d.request)!;
  assert.deepEqual(
    [item.bucket, item.state, item.owner, item.actionKey, item.urgency],
    ['to_send', 'action_required', OPERATIONAL_OWNERS.assistantDn, 'send_to_director', 'normal']
  );
  assert.equal('statusLabel' in item, false);
});
it('sent: with_director / waiting / Assistante DN / record_director_annotation; urgency normal however long (D10)', async () => {
  /* sendToDirector, then backdate signature_sent_at by 30 days via SQL */
});
it('returned: returned / done / owner null / handed_to_dn', async () => {
  /* returnAnnotated */
});
it('B1: pending on a closed dossier is inactive in items and outside to_send / with_director counts', async () => {
  /* requestStatus 'cancelled' */
});
it('issues exactly 4 queries whatever the number of circuits', async () => {
  /* countQueries pattern from Task 4: 1 then 3 extra circuits */
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `apps/api`, with `DATABASE_URL`): `npx tsx --test --test-concurrency=1 src/modules/dn-annotation/dn-circuit-queue.db.test.ts`
Expected: FAIL (`state` is undefined).

- [ ] **Step 3: API types and service**

`dn-annotation.types.ts`:

```ts
import type {
  DnCircuitActionKey,
  DnCircuitBucket,
  OperationalQueue,
  OperationalQueueItem,
} from '@aidn/shared';

export type DnAnnotationAction = 'send_to_director' | 'upload_annotated_return';

export interface DnCircuitQueueItem extends OperationalQueueItem<
  DnCircuitBucket,
  DnCircuitActionKey
> {
  requestType: string;
  applicantName: string;
  circuitDocumentId: number;
  fileUrl: string | null;
  mimeType: string | null;
  /** Task creation = the DG-annotated return was uploaded. */
  createdAt: Date;
  sentToDirectorAt: Date | null;
  returnedAt: Date | null;
  availableActions: DnAnnotationAction[];
  /** Whole working days since the hand-over (informational only, D10). */
  directorWorkingDays: number | null;
  predatesProcess: boolean;
}

export type DnCircuitQueueResponse = OperationalQueue<DnCircuitQueueItem, DnCircuitBucket>;
/** @deprecated kept for the mutation callers. */
export type DnAnnotationTaskView = DnCircuitQueueItem;
export type DnAnnotationListResponse = DnCircuitQueueResponse;
```

In `dn-annotation.service.ts`, replace `bucketOf` and `buildView`, and the end of `listDnAnnotationTasks`; remove `visibleIn` and the `DN_CIRCUIT_STATUS_LABELS` import (the constant stays in `dn-annotation.stage.ts` for its own test):

```ts
type Operational = Pick<
  DnCircuitQueueItem,
  'bucket' | 'state' | 'owner' | 'actionKey' | 'blockReason'
>;

function operationalOf(status: string, dossierClosed: boolean): Operational {
  const pending = status === 'submitted' || status === 'in_signature_circuit';
  if (pending && dossierClosed)
    return {
      bucket: 'inactive',
      state: 'done',
      owner: null,
      actionKey: 'none',
      blockReason: 'dossier_closed',
    };
  if (status === 'submitted')
    return {
      bucket: 'to_send',
      state: 'action_required',
      owner: OPERATIONAL_OWNERS.assistantDn,
      actionKey: 'send_to_director',
      blockReason: null,
    };
  if (status === 'in_signature_circuit')
    return {
      bucket: 'with_director',
      state: 'waiting',
      owner: OPERATIONAL_OWNERS.assistantDn,
      actionKey: 'record_director_annotation',
      blockReason: null,
    };
  if (status === 'pending_review')
    return {
      bucket: 'returned',
      state: 'done',
      owner: null,
      actionKey: 'handed_to_dn',
      blockReason: null,
    };
  return { bucket: 'inactive', state: 'done', owner: null, actionKey: 'none', blockReason: null };
}

function stepSinceOf(row: Circuit): Date {
  if (row.status === 'in_signature_circuit') return row.signatureSentAt ?? row.depositedAt;
  if (row.status === 'pending_review') return row.pendingReviewAt ?? row.depositedAt;
  return row.depositedAt;
}

function buildView(row: Circuit, ctx: Context): DnCircuitQueueItem | null {
  const request = ctx.requestsById.get(row.requestId);
  if (!request) return null;
  const flags = dossierFlags(request.status);
  const document = ctx.documentsByCircuitId.get(row.id);
  const withDirector = row.status === 'in_signature_circuit' && row.signatureSentAt !== null;
  return {
    id: `${ENTITY_TYPE}:${row.requestId}`,
    requestId: row.requestId,
    requestReference: request.reference,
    organisationName: request.organisationName ?? '-',
    ...operationalOf(row.status, flags.dossierClosed),
    urgency: 'normal', // D10: Directeur DN aging is informational only
    stepSince: stepSinceOf(row).toISOString(),
    dueAt: null,
    ...flags,
    requestType: request.requestType,
    applicantName: request.applicantName ?? '-',
    circuitDocumentId: row.id,
    fileUrl: document?.fileUrl ?? null,
    mimeType: document?.mimeType ?? null,
    createdAt: row.depositedAt,
    sentToDirectorAt: row.signatureSentAt,
    returnedAt: row.pendingReviewAt,
    availableActions: flags.dossierClosed ? [] : actionsFor(row.status),
    directorWorkingDays: withDirector
      ? Math.floor(workingDaysBetween(row.signatureSentAt!, ctx.now, ctx.holidays))
      : null,
    predatesProcess:
      row.status === 'pending_review' && (ctx.versionCountByCircuitId.get(row.id) ?? 0) === 0,
  };
}
```

`listDnAnnotationTasks` ends with:

```ts
const items = filters.bucket ? tasks.filter((task) => task.bucket === filters.bucket) : tasks;
return { items, counts: countBuckets(DN_CIRCUIT_BUCKETS, tasks) };
```

Return type: `Promise<DnCircuitQueueResponse>`.

In `dn-annotation.db.test.ts`:

- replace `statusLabel` assertions with `actionKey`: `'record_director_annotation'` after send, `'handed_to_dn'` after return, `'send_to_director'` when listed;
- in the closed-dossier case, the task is `bucket: 'inactive'`; it is absent from `listDnAnnotationTasks({ bucket: 'to_send' })` and present in `listDnAnnotationTasks({})`.

- [ ] **Step 4: Admin copy (with its test first)**

`dnCircuitCopy.test.ts` asserts:

```ts
expect(dnCircuitCallout(dn({ actionKey: 'send_to_director' })).title).toBe(
  'À transmettre au Directeur DN'
);
expect(
  dnCircuitCallout(
    dn({ actionKey: 'record_director_annotation', bucket: 'with_director', directorWorkingDays: 4 })
  ).description
).toBe(
  'Le dossier est chez le Directeur DN depuis 4 j ouvrés. Téléversez le retour annoté dès réception.'
);
expect(dnCircuitCallout(dn({ actionKey: 'handed_to_dn', bucket: 'returned' })).description).toBe(
  'Annotation du Directeur DN reçue. La DN peut ouvrir la phase préliminaire.'
);
// items: one to_send, one with_director, one returned 5 days before `now`, three inactive
expect(
  dnCircuitMetrics(items, { to_send: 1, with_director: 1, returned: 1, inactive: 3 }, now).map(
    (m) => m.value
  )
).toEqual([1, 1, 1]); // inactive never read
```

`dnCircuitCopy.ts`:

```ts
import type { DnCircuitBucket } from '@aidn/shared';
import type { DnAnnotationTask } from '../../lib/api/dn-annotation';
import type { CockpitMetric } from '../../components/cockpit/CockpitMetrics';
import type { QueueMode } from '../../lib/cockpit/queue';

export type DnCircuitTab = Exclude<DnCircuitBucket, 'inactive'> | 'all';
export const DN_CIRCUIT_TABS: Array<{ key: DnCircuitTab; label: string }> = [
  { key: 'to_send', label: 'À transmettre' },
  { key: 'with_director', label: 'Chez le Directeur DN' },
  { key: 'returned', label: 'Transmis à la DN' },
  { key: 'all', label: 'Tous' },
];
export const DN_CIRCUIT_TAB_MODES: Record<DnCircuitTab, QueueMode> = {
  to_send: 'action',
  with_director: 'waiting',
  returned: 'history',
  all: 'history',
};

export function dnCircuitCallout(item: DnAnnotationTask): {
  title: string;
  description: string;
  blockReason: string | null;
} {
  if (item.blockReason === 'dossier_closed')
    return {
      title: 'Dossier clos - consultation uniquement',
      description: 'Le circuit reste consultable. Aucune action n’est possible.',
      blockReason: null,
    };
  if (item.actionKey === 'send_to_director')
    return {
      title: 'À transmettre au Directeur DN',
      description:
        'Annotation du DG reçue. Remettez le dossier au Directeur DN, puis marquez-le transmis.',
      blockReason: null,
    };
  if (item.actionKey === 'record_director_annotation') {
    const since =
      item.directorWorkingDays === null ? '' : ` depuis ${item.directorWorkingDays} j ouvrés`;
    return {
      title: 'Chez le Directeur DN',
      description: `Le dossier est chez le Directeur DN${since}. Téléversez le retour annoté dès réception.`,
      blockReason: null,
    };
  }
  if (item.actionKey === 'handed_to_dn')
    return {
      title: 'Transmis à la DN',
      description: 'Annotation du Directeur DN reçue. La DN peut ouvrir la phase préliminaire.',
      blockReason: null,
    };
  return { title: 'Circuit archivé', description: 'Consultation uniquement.', blockReason: null };
}

const DAY_MS = 86_400_000;
export function dnCircuitMetrics(
  items: DnAnnotationTask[],
  counts: Record<DnCircuitBucket, number>,
  now: Date = new Date()
): CockpitMetric[] {
  const waits = items
    .filter((i) => i.bucket === 'with_director' && i.directorWorkingDays !== null)
    .map((i) => i.directorWorkingDays!);
  const average = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null;
  const handed30 = items.filter(
    (i) =>
      i.bucket === 'returned' &&
      i.returnedAt &&
      now.getTime() - new Date(i.returnedAt).getTime() <= 30 * DAY_MS
  ).length;
  return [
    { key: 'to_send', label: 'à transmettre', value: counts.to_send, detail: null, tone: 'info' },
    {
      key: 'with_director',
      label: 'chez le Directeur DN',
      value: counts.with_director,
      detail:
        average === null
          ? null
          : `délai moyen ${average.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j ouvrés`,
      tone: 'warning',
    },
    {
      key: 'returned_30',
      label: 'transmis à la DN (30 j)',
      value: handed30,
      detail: null,
      tone: 'success',
    },
  ];
}
```

Admin `lib/api/dn-annotation/types.ts`: the same shape as the API `DnCircuitQueueItem`, with ISO strings. `DnAnnotationTask` extends `OperationalQueueItem<DnCircuitBucket, DnCircuitActionKey>`, and `DnAnnotationListResponse = OperationalQueue<DnAnnotationTask, DnCircuitBucket>`.

- [ ] **Step 5: The page**

Rewrite `CircuitDirecteurDnPage.tsx` with the same structure as `CourrierTasksPage` (Task 5), with these differences:

- query `queryKeys.dnCircuit.queue()` with `fetchDnAnnotationTasks`; tabs `DN_CIRCUIT_TABS`, default `'to_send'`, `mode = DN_CIRCUIT_TAB_MODES[tab]`, `useUrlSelection(visible, !query.isLoading)`;
- title « Circuit Directeur DN »; metrics `dnCircuitMetrics`; search haystack `[requestReference, organisationName, applicantName, REQUEST_TYPE_LABELS[requestType]]` (import from `../courrier-tasks/courrierCopy`);
- list row: organisation + `formatRowDate(stepSince)`, reference, `ClosedDossierBadge`, `AgingBadge` with `urgency="normal"` and `workingDays={directorWorkingDays}` in `with_director`, then the callout title as the row label;
- pane: `QueueReadingPane` with header (`REQUEST_TYPE_LABELS`, reference, closed badge) and callout `{ state, title, description, owner, canAct: canAct(owner, roles) && !!cta, cta, secondary, blockReason }`, where:
  - `cta` = « Marquer transmis au Directeur DN » (`sendToDirectorDn`) when `availableActions` includes `send_to_director`; « Téléverser le retour annoté » (opens `CockpitUploadModal` with `label="Document annoté par le Directeur DN"` and `hint="Une fois enregistré, la DN peut ouvrir la phase préliminaire du dossier."`) when it includes `upload_annotated_return`;
  - `secondary` = « Voir le document » (if `fileUrl`) + « Voir le dossier » (`/demandes/${requestId}/phase-preliminaire`) for DN roles or SU;
- body: the existing `Info` list (« Annotation du DG reçue », « Transmis au Directeur DN », « Annotation du Directeur DN reçue », « Délai chez le Directeur DN » (info), and the `predatesProcess` note), moved unchanged except the label « En circuit Directeur DN » → « Transmis au Directeur DN »;
- mutations: same `run(...)` helper and `DOSSIER_CLOSED` reload as Task 5.

Rewrite `CircuitDirecteurDnPage.test.tsx`:

- (a) default tab « À transmettre » with its CTA for `assistant_dn`;
- (b) the closed pending item appears only under « Tous », with the closed badge and no CTA;
- (c) `reception` gets no CTA;
- (c2) « Chez le Directeur DN » groups a normal item under « En attente », never « À traiter »;
- (d) the return modal calls `return-annotated` with the uploaded asset (keep the existing upload mock from the current test).

- [ ] **Step 6: Run the tests**

Run: the API files from Steps 1 and 3 (with `DATABASE_URL`), then from `apps/admin`: `npx vitest run src/pages/dn-annotation`, then `npx vitest run`.
Expected: PASS.

---

### Task 7: Finance queue endpoint (API) and removal of the per-phase payment queues

**Files:**

- Create: `apps/api/src/modules/payments/finance-queue.ts`, `finance-queue.types.ts`, `payments.controller.ts`, `payments.route.ts`
- Modify: `apps/api/src/server.ts` (mount `app.use('/api/payments', paymentsRoute)` next to the other modules)
- Remove (after the caller audit): `GET /payment-queue` in `deep-evaluation.route.ts`, `site-inspection.route.ts`, `certificates.route.ts`; their controller functions; the `getPaymentQueue` service functions; the `nextPaymentAction` helpers and the `PaymentQueueItem` types, wherever they become unused
- Modify: `apps/api/src/modules/requests/closed-dossier-lists.db.test.ts` (`m.deep/site/cert.getPaymentQueue` → `getFinanceQueue`)
- Test: `apps/api/src/modules/payments/finance-queue.db.test.ts`, `apps/api/src/modules/payments/finance-queue.http.test.ts`

**Interfaces:**

- Consumes: Tasks 1 and 4 (`loadThresholds`, `calendarDaysSince`, `iso`).
- Produces:
  - `getFinanceQueue(now?: Date): Promise<FinanceQueueResponse>` and `buildFinanceItem(row: FinanceRow, thresholds: { invoiceUploadDays: number; paymentValidationDays: number }, now: Date): FinanceQueueItem`;
  - `FinanceQueueItem` with domain fields `phaseId`, `phaseCode: 'M5' | 'M6' | 'M7'`, `requestType`, `phaseOpenedAt: Date`, `payment: FinancePaymentView`, `newProofRequested: boolean`;
  - `GET /api/payments/finance-queue` (`s5_agent`, `SU`).

- [ ] **Step 1: Caller audit (required before any deletion)**

Run from the repo root and record the output in the task report:

```bash
rg -n "payment-queue|getPaymentQueue|paymentQueue\(|fetchDeepEvaluationPaymentQueue|fetchSiteInspectionPaymentQueue|fetchCertificatesPaymentQueue|nextPaymentAction|PaymentQueueItem" apps packages scripts --glob '!**/dist/**' --glob '!**/node_modules/**'
```

Expected consumers, and only these:

- the three route, controller and service definitions themselves;
- `apps/admin/src/pages/payments/S5PaymentsPage.tsx`;
- `apps/admin/src/lib/api/{deep-evaluation,site-inspection,certificates}.api.ts` and `.types.ts`;
- `apps/admin/src/lib/react-query/queryKeys.ts` and `queryClient.ts`;
- `apps/admin/src/pages/closed-dossier-lists.test.tsx`;
- `apps/api/src/modules/requests/closed-dossier-lists.db.test.ts`;
- the retired dashboard (not a consumer of these routes).

If any other consumer appears (a phase page, a script, the portal), do **not** delete that item: keep it, list the consumer in the report, and continue with the rest. The admin-side removals happen in Task 8; this task removes the API side only.

- [ ] **Step 2: Write the failing tests**

`finance-queue.db.test.ts`: fixtures as in `applicant-actions.db.test.ts` (`newApplicant`, `dossier(owner, codes, status)`), plus `payment(phaseId, over)`, which inserts `payments (phase_id, status, invoice_uploaded_at, proof_uploaded_at, validated_at, rejection_reason, rejection_action)`, and `openedDaysAgo(phaseId, days)`, which runs `UPDATE phases SET opened_at = now() - ($2 || ' days')::interval WHERE id = $1`.

```ts
const find = async (phaseId: number) =>
  (await finance.getFinanceQueue()).items.find((i) => i.phaseId === phaseId)!;

it('awaiting_invoice: invoice_to_send / Finance / send_invoice; B2: urgency from the phase opening', async () => {
  const d = await dossier(undefined, ['M5']);
  await payment(d.phase.M5, { status: 'awaiting_invoice' });
  await openedDaysAgo(d.phase.M5, 5); // default target 2 days
  const item = await find(d.phase.M5);
  assert.deepEqual(
    [item.bucket, item.state, item.owner, item.actionKey, item.urgency],
    ['invoice_to_send', 'action_required', OPERATIONAL_OWNERS.finance, 'send_invoice', 'overdue']
  );
  assert.equal(item.stepSince, item.phaseOpenedAt.toISOString());
});
it('pending_validation: proof_to_validate; urgency from proofUploadedAt', async () => {
  /* proof 3 days ago, target 1 → overdue */
});
it('awaiting_proof: awaiting_applicant / waiting / Postulant; never overdue (no + 4 j rule)', async () => {
  /* invoice 30 days ago → 'normal' */
});
it('B3: a new proof requested shows newProofRequested and the reason; a rejected dossier is done, not work', async () => {
  // awaiting_proof + rejection_reason 'Montant illisible' + rejection_action 'request_new_proof' → newProofRequested true, payment.rejectionReason set
  // status 'rejected' on a request with status 'rejected' → bucket 'done', blockReason 'dossier_closed', owner null
});
it('B1: pending payment on a closed dossier is inactive and outside the action counts', async () => {
  /* request 'cancelled' */
});
it('validated: done; M5, M6 and M7 all listed with their phaseCode', async () => {
  /* three phases */
});
it('issues exactly 2 queries whatever the number of payments', async () => {
  /* countQueries: 1 payment then 4 more */
});
```

`finance-queue.http.test.ts` uses the pattern of `applicant-actions.http.test.ts` (including closing the app pool in `after`): mount `payments.route.js` at `/api/payments` behind `cookie-parser`. Staff tokens come from `jwt.signAccessToken({ kind: 'staff', userId: 1, employeeCode: 'T', roles })`, sent as cookie `${ACCESS_TOKEN_COOKIE}=<token>`.

- no cookie → 401;
- `dn_agent` → 403;
- `r3_agent` → 403;
- `s5_agent` → 200, and the body has `items` (array) and `counts` (skip without `DATABASE_URL`).

- [ ] **Step 3: Run them to verify they fail**

Run (from `apps/api`): `npx tsx --test --test-concurrency=1 src/modules/payments/finance-queue.db.test.ts src/modules/payments/finance-queue.http.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 4: Write the module**

`finance-queue.types.ts`:

```ts
import type {
  FinanceActionKey,
  FinanceBucket,
  OperationalQueue,
  OperationalQueueItem,
} from '@aidn/shared';

export interface FinancePaymentView {
  id: number;
  status: string;
  invoiceFileUrl: string | null;
  invoiceUploadedAt: Date | null;
  proofFileUrl: string | null;
  proofUploadedAt: Date | null;
  validatedAt: Date | null;
  rejectionReason: string | null;
  rejectionAction: string | null;
}

export interface FinanceQueueItem extends OperationalQueueItem<FinanceBucket, FinanceActionKey> {
  phaseId: number;
  phaseCode: 'M5' | 'M6' | 'M7';
  requestType: string;
  phaseOpenedAt: Date;
  payment: FinancePaymentView;
  /** B3 - awaiting a new proof after a « request_new_proof » rejection. */
  newProofRequested: boolean;
}

export type FinanceQueueResponse = OperationalQueue<FinanceQueueItem, FinanceBucket>;
```

`finance-queue.ts`:

```ts
/** SESSION1-COCKPIT-1 §5.3 / §7.3 - the Finance queue: every M5 / M6 / M7
 *  payment in ONE query (plus one parameter read). Replaces the three
 *  per-phase payment queues. B2: the invoice delay counts from the phase
 *  opening. B3: a rejected payment means a rejected dossier (done); a new
 *  proof requested is flagged. */
import { desc, eq, inArray } from 'drizzle-orm';
import { FINANCE_BUCKETS, OPERATIONAL_OWNERS, countBuckets, urgencyFromAge } from '@aidn/shared';
import { db } from '../../shared/db/index.js';
import { organisations, payments, phases, requests } from '../../shared/db/schema.js';
import { dossierFlags } from '../requests/dossier-open.js';
import { calendarDaysSince } from '../operational/aging.js';
import { loadThresholds } from '../operational/thresholds.js';
import type { FinanceQueueItem, FinanceQueueResponse } from './finance-queue.types.js';

export interface FinanceRow {
  phaseId: number;
  phaseCode: string;
  phaseOpenedAt: Date;
  requestId: number;
  requestReference: string;
  requestType: string;
  requestStatus: string;
  organisationName: string;
  payment: typeof payments.$inferSelect;
}

const PENDING = ['awaiting_invoice', 'awaiting_proof', 'pending_validation'];
type Op = Pick<
  FinanceQueueItem,
  'bucket' | 'state' | 'owner' | 'actionKey' | 'blockReason' | 'urgency'
> & { since: Date | null };

export function buildFinanceItem(
  row: FinanceRow,
  t: { invoiceUploadDays: number; paymentValidationDays: number },
  now: Date
): FinanceQueueItem {
  const flags = dossierFlags(row.requestStatus);
  const p = row.payment;
  const none = { owner: null, actionKey: 'none' as const, urgency: 'normal' as const };
  let op: Op;
  if (p.status === 'validated')
    op = { bucket: 'done', state: 'done', blockReason: null, since: p.validatedAt, ...none };
  else if (p.status === 'rejected')
    op = {
      bucket: 'done',
      state: 'done',
      blockReason: 'dossier_closed',
      since: p.proofUploadedAt ?? p.invoiceUploadedAt ?? row.phaseOpenedAt,
      ...none,
    };
  else if (PENDING.includes(p.status) && flags.dossierClosed)
    op = {
      bucket: 'inactive',
      state: 'done',
      blockReason: 'dossier_closed',
      since: p.proofUploadedAt ?? p.invoiceUploadedAt ?? row.phaseOpenedAt,
      ...none,
    };
  else if (p.status === 'awaiting_invoice')
    op = {
      bucket: 'invoice_to_send',
      state: 'action_required',
      owner: OPERATIONAL_OWNERS.finance,
      actionKey: 'send_invoice',
      blockReason: null,
      since: row.phaseOpenedAt,
      urgency: urgencyFromAge(calendarDaysSince(row.phaseOpenedAt, now), t.invoiceUploadDays),
    };
  else if (p.status === 'pending_validation')
    op = {
      bucket: 'proof_to_validate',
      state: 'action_required',
      owner: OPERATIONAL_OWNERS.finance,
      actionKey: 'validate_payment_proof',
      blockReason: null,
      since: p.proofUploadedAt,
      urgency: urgencyFromAge(calendarDaysSince(p.proofUploadedAt, now), t.paymentValidationDays),
    };
  else if (p.status === 'awaiting_proof')
    op = {
      bucket: 'awaiting_applicant',
      state: 'waiting',
      owner: OPERATIONAL_OWNERS.applicant,
      actionKey: 'await_payment_proof',
      blockReason: null,
      since: p.invoiceUploadedAt,
      urgency: 'normal',
    };
  else op = { bucket: 'inactive', state: 'done', blockReason: null, since: null, ...none };

  const { since, ...operational } = op;
  return {
    id: `${row.phaseCode}:${row.phaseId}`,
    requestId: row.requestId,
    requestReference: row.requestReference,
    organisationName: row.organisationName,
    ...operational,
    stepSince: since ? since.toISOString() : null,
    dueAt: null,
    ...flags,
    phaseId: row.phaseId,
    phaseCode: row.phaseCode as FinanceQueueItem['phaseCode'],
    requestType: row.requestType,
    phaseOpenedAt: row.phaseOpenedAt,
    payment: {
      id: p.id,
      status: p.status,
      invoiceFileUrl: p.invoiceFileUrl,
      invoiceUploadedAt: p.invoiceUploadedAt,
      proofFileUrl: p.proofFileUrl,
      proofUploadedAt: p.proofUploadedAt,
      validatedAt: p.validatedAt,
      rejectionReason: p.rejectionReason,
      rejectionAction: p.rejectionAction,
    },
    newProofRequested: p.status === 'awaiting_proof' && p.rejectionReason !== null,
  };
}

export async function getFinanceQueue(now: Date = new Date()): Promise<FinanceQueueResponse> {
  const [rows, t] = await Promise.all([
    db
      .select({
        phaseId: phases.id,
        phaseCode: phases.phaseCode,
        phaseOpenedAt: phases.openedAt,
        requestId: requests.id,
        requestReference: requests.reference,
        requestType: requests.requestType,
        requestStatus: requests.status,
        organisationName: organisations.name,
        payment: payments,
      })
      .from(phases)
      .innerJoin(requests, eq(phases.requestId, requests.id))
      .innerJoin(organisations, eq(requests.organisationId, organisations.id))
      .innerJoin(payments, eq(payments.phaseId, phases.id))
      .where(inArray(phases.phaseCode, ['M5', 'M6', 'M7']))
      .orderBy(desc(phases.openedAt)),
    loadThresholds(['invoiceUploadDays', 'paymentValidationDays']),
  ]);
  const items = rows.map((row) => buildFinanceItem(row, t, now));
  return { items, counts: countBuckets(FINANCE_BUCKETS, items) };
}
```

`payments.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { handleRequestsError } from '../../shared/utils/error.js';
import { getFinanceQueue } from './finance-queue.js';

export async function financeQueue(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getFinanceQueue());
  } catch (error) {
    handleRequestsError(res, error);
  }
}
```

`payments.route.ts`:

```ts
import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as paymentsController from './payments.controller.js';

const router = Router();
router.get(
  '/finance-queue',
  authenticate,
  requireRole('s5_agent', 'SU'),
  paymentsController.financeQueue
);
export default router;
```

Mount it in `server.ts`: `import paymentsRoute from './modules/payments/payments.route.js';` and `app.use('/api/payments', paymentsRoute);`.

- [ ] **Step 5: Remove the per-phase queues (API side, per the audit)**

Delete:

- the `/payment-queue` routes;
- their controller functions;
- `getPaymentQueue` in the three services;
- each module's `nextPaymentAction` and `PaymentQueueItem` type, if nothing else uses them.

Keep `toPaymentView` (the bundles use it). In `closed-dossier-lists.db.test.ts`, replace the three `getPaymentQueue()` calls with:

```ts
const finance = await m.finance.getFinanceQueue();
const mineFinance = (code: string) =>
  finance.items.find((item) => item.requestId === d.request && item.phaseCode === code)!;
```

Assert:

- a closed dossier gives `bucket: 'inactive'` (pending) and an empty-action state;
- an open dossier gives `actionKey: 'validate_payment_proof'` (M5) and `'send_invoice'` (M7).

- [ ] **Step 6: Run the tests**

Run (from `apps/api`, with `DATABASE_URL`): the two new files and `src/modules/requests/closed-dossier-lists.db.test.ts`; then `npm run typecheck --workspace=apps/api`.
Expected: PASS.

---

### Task 8: Finance cockpit (admin)

**Files:**

- Modify: `apps/admin/src/lib/api/` (new `payments.api.ts` + `payments.types.ts` with `fetchFinanceQueue()`, types mirroring Task 7 with ISO strings); remove `fetchDeepEvaluationPaymentQueue`, `fetchSiteInspectionPaymentQueue` and `fetchCertificatesPaymentQueue` and their `PaymentQueueItem` types (per the Task 7 audit)
- Modify: `queryKeys.ts` (remove the three `paymentQueue` keys; add `payments: { all: ['payments'], financeQueue: () => ['payments', 'finance-queue'] }`), `queryClient.ts` (`DOSSIER_WORK_LISTS`: replace the three keys with `queryKeys.payments.financeQueue()`)
- Create: `apps/admin/src/pages/payments/financeCopy.ts`, `FinancePaymentPane.tsx`
- Rewrite: `apps/admin/src/pages/payments/S5PaymentsPage.tsx` (page only; `RejectModal` keeps its export and behaviour)
- Test: `apps/admin/src/pages/payments/financeCopy.test.ts`, `apps/admin/src/pages/payments/S5PaymentsPage.test.tsx`; update `apps/admin/src/pages/closed-dossier-lists.test.tsx` (`<S5PaymentsPage>` block and the queryClient test)

**Interfaces:**

- Consumes: Tasks 1, 2 and 7.
- Produces: `FINANCE_TABS`, `financeCallout(item)`, `financeMetrics(items, counts, now?)`, `FinancePaymentPane`.

- [ ] **Step 1: Write the failing tests**

`financeCopy.test.ts` (with a `payment(...)` factory over `FinanceQueueItem`):

```ts
it('callouts (D8 wording)', () => {
  expect(financeCallout(item({ actionKey: 'send_invoice' })).title).toBe('Facture à transmettre');
  expect(financeCallout(item({ actionKey: 'validate_payment_proof' })).title).toBe(
    'Preuve de paiement à valider'
  );
  const waiting = financeCallout(
    item({ actionKey: 'await_payment_proof', bucket: 'awaiting_applicant' })
  );
  expect(waiting.title).toBe('En attente du postulant');
  expect(waiting.description).toBe(
    'La facture a été transmise. La preuve de paiement est attendue.'
  );
  const again = financeCallout(
    item({
      actionKey: 'await_payment_proof',
      newProofRequested: true,
      payment: { ...p, rejectionReason: 'Montant illisible' },
    })
  );
  expect(again.description).toBe(
    'La facture a été transmise. Nouvelle preuve de paiement demandée : Montant illisible'
  );
  expect(
    financeCallout(
      item({
        bucket: 'done',
        actionKey: 'none',
        payment: { ...p, status: 'rejected' },
        blockReason: 'dossier_closed',
      })
    ).title
  ).toBe('Dossier rejeté - paiement clos');
  for (const key of ['send_invoice', 'validate_payment_proof', 'await_payment_proof'] as const) {
    const copy = financeCallout(item({ actionKey: key }));
    expect(`${copy.title} ${copy.description}`).not.toMatch(/quittance|S5/i);
  }
});
it('metrics: action buckets only; « Validés (30 j) » from validatedAt in the rows', () => {
  /* counts.inactive = 9 never shown */
});
```

`S5PaymentsPage.test.tsx` (new). Mock `useAuth` with mutable `roles`; seed `queryKeys.payments.financeQueue()`.

```tsx
it('lands on « Factures à transmettre »; Finance gets « Joindre la facture transmise »', ...);
it('a proof to validate offers « Valider » and « Rejeter »; the rejection flow is unchanged (RejectModal)', ...);
it('waiting on the applicant: owner Postulant, no CTA, the rejection reason is shown when a new proof was requested', ...);
it('« En attente du postulant » groups a normal item under « En attente », never « À traiter »', ...);
it('a role that cannot act (dn_agent) sees the pane without any CTA but with « Consulter la phase »', ...);
it('empty queue: the default tab shows « Aucun paiement dans cette vue », metrics 0, no error', ...);
it('DOSSIER_CLOSED on « Valider »: reloads the queue and shows the API message', ...);
it('no pagination control is rendered', () => { /* 25 rows → all 25 options in the listbox */ });
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `apps/admin`): `npx vitest run src/pages/payments`
Expected: FAIL.

- [ ] **Step 3: `financeCopy.ts`**

```ts
import type { FinanceBucket } from '@aidn/shared';
import type { FinanceQueueItem } from '../../lib/api/payments.types';
import type { CockpitMetric } from '../../components/cockpit/CockpitMetrics';
import type { QueueMode } from '../../lib/cockpit/queue';

export type FinanceTab = Exclude<FinanceBucket, 'inactive'> | 'all';
export const FINANCE_TABS: Array<{ key: FinanceTab; label: string }> = [
  { key: 'invoice_to_send', label: 'Factures à transmettre' },
  { key: 'proof_to_validate', label: 'Preuves à valider' },
  { key: 'awaiting_applicant', label: 'En attente du postulant' },
  { key: 'done', label: 'Traités' },
  { key: 'all', label: 'Tous' },
];
export const FINANCE_TAB_MODES: Record<FinanceTab, QueueMode> = {
  invoice_to_send: 'action',
  proof_to_validate: 'action',
  awaiting_applicant: 'waiting',
  done: 'history',
  all: 'history',
};
export const PHASE_LABELS: Record<FinanceQueueItem['phaseCode'], string> = {
  M5: 'Évaluation approfondie',
  M6: 'Démonstration / Inspection',
  M7: 'Délivrance',
};

export function financeCallout(item: FinanceQueueItem): {
  title: string;
  description: string;
  blockReason: string | null;
} {
  if (item.payment.status === 'rejected')
    return {
      title: 'Dossier rejeté - paiement clos',
      description: 'Le paiement et ses pièces restent consultables.',
      blockReason: null,
    };
  if (item.blockReason === 'dossier_closed')
    return {
      title: 'Dossier clos - consultation uniquement',
      description:
        'Le paiement et ses pièces restent consultables. Aucune action Finance n’est possible.',
      blockReason: null,
    };
  switch (item.actionKey) {
    case 'send_invoice':
      return {
        title: 'Facture à transmettre',
        description:
          'Joignez la facture transmise au postulant : la preuve de paiement sera ensuite attendue.',
        blockReason: null,
      };
    case 'validate_payment_proof':
      return {
        title: 'Preuve de paiement à valider',
        description: 'Contrôlez la preuve de paiement du postulant avant de débloquer la phase.',
        blockReason: null,
      };
    case 'await_payment_proof':
      return {
        title: 'En attente du postulant',
        description:
          item.newProofRequested && item.payment.rejectionReason
            ? `La facture a été transmise. Nouvelle preuve de paiement demandée : ${item.payment.rejectionReason}`
            : 'La facture a été transmise. La preuve de paiement est attendue.',
        blockReason: null,
      };
    default:
      return {
        title: 'Paiement validé',
        description: 'Le paiement ne requiert plus d’action Finance.',
        blockReason: null,
      };
  }
}

const DAY_MS = 86_400_000;
export function financeMetrics(
  items: FinanceQueueItem[],
  counts: Record<FinanceBucket, number>,
  now: Date = new Date()
): CockpitMetric[] {
  const late = (bucket: FinanceBucket) =>
    items.filter((i) => i.bucket === bucket && i.urgency === 'overdue').length;
  const lateDetail = (n: number) => (n > 0 ? `dont ${n} en retard` : null);
  const newProof = items.filter(
    (i) => i.bucket === 'awaiting_applicant' && i.newProofRequested
  ).length;
  const validated30 = items.filter(
    (i) =>
      i.payment.validatedAt &&
      now.getTime() - new Date(i.payment.validatedAt).getTime() <= 30 * DAY_MS
  ).length;
  return [
    {
      key: 'invoice_to_send',
      label: 'factures à transmettre',
      value: counts.invoice_to_send,
      detail: lateDetail(late('invoice_to_send')),
      tone: 'info',
    },
    {
      key: 'proof_to_validate',
      label: 'preuves à valider',
      value: counts.proof_to_validate,
      detail: lateDetail(late('proof_to_validate')),
      tone: 'warning',
    },
    {
      key: 'awaiting_applicant',
      label: 'en attente du postulant',
      value: counts.awaiting_applicant,
      detail: newProof > 0 ? `dont ${newProof} nouvelle preuve demandée` : null,
      tone: 'neutral',
    },
    {
      key: 'validated_30',
      label: 'validés (30 j)',
      value: validated30,
      detail: null,
      tone: 'success',
    },
  ];
}
```

- [ ] **Step 4: Pane and page**

`FinancePaymentPane.tsx` renders `QueueReadingPane`:

- **Header:** reference, `PHASE_LABELS[phaseCode]`, organisation, `ClosedDossierBadge`.
- **Callout:** `financeCallout`, with `canAct: canAct(owner, roles) && !!cta`.
- **`cta`:**
  - `send_invoice` → button « Joindre la facture transmise » (opens `CockpitUploadModal` with `label="Facture transmise au postulant"`);
  - `validate_payment_proof` → « Valider la preuve de paiement » + « Rejeter » (destructive; opens the existing `RejectModal`).
- **`secondary`:** « Consulter la phase » (the existing `phasePath(item)` from the old page).
- **Body:**
  - « Pièces de paiement »: the existing `PaymentDocumentRow` moved unchanged, with labels « Facture transmise » and « Preuve de paiement »;
  - « Suivi »: the existing `S5Timeline` moved unchanged, its labels renamed to « Facture transmise », « Preuve de paiement reçue », « Décision Finance »;
  - when `newProofRequested`: an `Info` « Motif de la demande » = `payment.rejectionReason`.
- **Removed:** « Montant » and `amountLabel`.

`S5PaymentsPage.tsx` follows the `CourrierTasksPage` structure (Task 5):

- one `useQuery(queryKeys.payments.financeQueue(), fetchFinanceQueue)`; tabs `FINANCE_TABS`, default `'invoice_to_send'`, `mode = FINANCE_TAB_MODES[tab]`, `useUrlSelection(visible, !query.isLoading)`;
- title « Paiements - Finance »; metrics `financeMetrics`; search haystack `[requestReference, organisationName, PHASE_LABELS[phaseCode], requestType]`;
- row: organisation + `formatRowDate(stepSince)`, reference · phase label, badges (`ClosedDossierBadge`, and `AgingBadge` in `invoice_to_send` / `proof_to_validate`), then the callout title as the row label;
- the mutation dispatch keeps the existing per-phase functions (`uploadInvoice`, `validatePayment`, `rejectPayment` from `deep-evaluation.api`, `site-inspection.api` and `certificates.api`), moved unchanged as `uploadInvoiceForItem`, `validatePaymentForItem` and `rejectPaymentForItem`;
- after success or `DOSSIER_CLOSED`, invalidate `queryKeys.payments.financeQueue()`.

Remove:

- the table, `Pagination`, `PAGE_SIZE`;
- `S5Header`, `S5MetricCard`, `S5Toolbar`, `S5PaymentTable`, `S5DetailPanel`, `S5ActionPanel`;
- `STATUS_LABELS`, `NEXT_ACTION_LABELS`, `BUCKET_LABELS`, `bucketForItem`;
- the local `waitingLabel`, `daysSince` and `amountLabel`.

Keep `export function RejectModal` exactly as it is (its test stays green).

- [ ] **Step 5: Update `closed-dossier-lists.test.tsx`**

- **Roles:** the file-level `useAuth` mock becomes mutable (`let roles = ['reception']`), and the `<S5PaymentsPage>` block sets `roles = ['s5_agent']` in its `beforeEach`.
- **Seeds:** use `queryKeys.payments.financeQueue()` with `{ items, counts }`.
- **Closed case:** the item is `bucket: 'inactive'`, under `?tab=all`; it has no « Valider » or « Rejeter », and the documents are still listed.
- **queryClient test:** expects `queryKeys.payments.financeQueue()` instead of the three keys.

- [ ] **Step 6: Run the tests**

Run (from `apps/admin`): `npx vitest run src/pages/payments src/pages/closed-dossier-lists.test.tsx`, then `npx vitest run`, then `npm run typecheck --workspace=apps/admin`.
Expected: PASS. Confirm with `rg -n "paymentQueue|PaymentQueue" apps/admin/src` that no reference is left.

---

### Task 9: B4 guard and the CI queue read model (API)

**Files:**

- Modify: `apps/api/src/modules/site-inspection/site-inspection.service.ts` (`markAssignedSiteVisitHeld`, `missionState` → `buildInspectionItem`, `getMyQueue`)
- Modify: `site-inspection.types.ts` (`MyQueueItem` → `InspectionQueueItem`, `InspectionQueueResponse`), `site-inspection.controller.ts` (`getMyQueue` passes the viewer)
- Modify: `apps/api/src/shared/utils/error.ts` (`handleSiteInspectionError` gains `MEETING_NOT_SCHEDULED` and `SITE_VISIT_PAYMENT_NOT_VALIDATED`)
- Modify: `apps/api/src/modules/requests/closed-dossier-lists.db.test.ts` (mission lines)
- Test: `apps/api/src/modules/site-inspection/site-visit-held.db.test.ts`, `site-visit-held.http.test.ts`, `inspection-queue.db.test.ts`

**Interfaces:**

- Consumes: Task 1 (`canRecordSiteVisitHeld`, `visitDayUrgency`, `INSPECTION_BUCKETS`, `countBuckets`, `OPERATIONAL_OWNERS`).
- Produces:
  - `getMyQueue(viewer: { userId: number; roles: readonly string[] }, now?: Date): Promise<InspectionQueueResponse>`;
  - `InspectionQueueItem` with domain fields `phaseId`, `phaseStatus`, `requestType`, `payment: PaymentView | null`, `siteVisit: SiteVisitView`, `inspection: InspectionView | null`, `assignedToViewer: boolean`, `assignedAgentName: string | null`;
  - error codes `SITE_VISIT_PAYMENT_NOT_VALIDATED` (409) and `MEETING_NOT_SCHEDULED` (409).

- [ ] **Step 1: Write the failing tests**

`site-visit-held.db.test.ts`: fixtures as in `applicant-actions.db.test.ts`, plus `user()` and an M6 `dossier`. `siteVisit(phaseId, agentId, status='scheduled')` inserts `meetings (phase_id, meeting_type='site_visit', dn_agent_id, scheduled_at, status)`; `payment(phaseId, status)` inserts into `payments`.

```ts
it('B4: refused while the payment is not validated; the visit stays scheduled; no audit row', async () => {
  for (const status of ['awaiting_invoice', 'awaiting_proof', 'pending_validation']) {
    const agent = await user();
    const d = await dossier(undefined, ['M6']);
    await payment(d.phase.M6, status);
    const visit = await siteVisit(d.phase.M6, agent);
    await assert.rejects(
      site.markAssignedSiteVisitHeld(visit, agent),
      /SITE_VISIT_PAYMENT_NOT_VALIDATED/,
      status
    );
    assert.equal(
      (await one(`SELECT status FROM meetings WHERE id = $1`, [visit])).status,
      'scheduled'
    );
    assert.equal(
      Number(
        (
          await one(
            `SELECT count(*) FROM audit_logs WHERE action = 'SITE_VISIT_HELD' AND entity_id = $1`,
            [visit]
          )
        ).count
      ),
      0
    );
  }
});
it('B4: accepted once the payment is validated', async () => {
  /* payment 'validated' → returns status 'held' */
});
it('scheduling before payment is still allowed', async () => {
  // scheduleSiteVisit({ phaseId, r3AgentId, scheduledAt, location, actorUserId }) with payment 'awaiting_invoice' resolves
  // (use the service's real signature: read it in site-inspection.service.ts:328)
});
it('guard order: closed dossier → DOSSIER_CLOSED; other agent → SITE_VISIT_NOT_ASSIGNED; already held → MEETING_NOT_SCHEDULED', async () => {});
it('two concurrent « held » calls: exactly one succeeds, the other is MEETING_NOT_SCHEDULED; one audit row', async () => {
  const agent = await user();
  const d = await dossier(undefined, ['M6']);
  await payment(d.phase.M6, 'validated');
  const visit = await siteVisit(d.phase.M6, agent);
  const results = await Promise.allSettled([
    site.markAssignedSiteVisitHeld(visit, agent),
    site.markAssignedSiteVisitHeld(visit, agent),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.match(String(rejected.reason), /MEETING_NOT_SCHEDULED/);
  assert.equal(
    Number(
      (
        await one(
          `SELECT count(*) FROM audit_logs WHERE action = 'SITE_VISIT_HELD' AND entity_id = $1`,
          [visit]
        )
      ).count
    ),
    1
  );
});
it('the verdict payment guard is unchanged: held + unpaid → PAYMENT_NOT_VALIDATED', async () => {
  // insert the visit directly with status 'held' and payment 'awaiting_proof'; submitInspectionVerdict rejects /PAYMENT_NOT_VALIDATED/
});
```

`site-visit-held.http.test.ts`: mount `site-inspection.route.js` at `/api/site-inspection` behind `cookie-parser` and `express.json()`, with staff cookies as in Task 7. With `DATABASE_URL`:

- `PATCH /api/site-inspection/site-visits/:id/held` with an unpaid visit as its agent → **409**, body `code: 'SITE_VISIT_PAYMENT_NOT_VALIDATED'` and message « Le paiement doit être validé par Finance avant d'enregistrer la tenue de la visite. »;
- the same call on an already-held visit → **409** `MEETING_NOT_SCHEDULED` (no longer 500);
- a `dn_agent` cookie → **403**.

Seed the rows with `pg` as in the DB test.

`inspection-queue.db.test.ts`:

```ts
it('payment not validated: awaiting_payment / blocked / payment_not_validated; owner follows the payment', async () => {
  // awaiting_invoice → finance, awaiting_proof → applicant, pending_validation → finance
});
it('paid + scheduled: to_hold / action_required / Cellule Inspection / record_visit_held; dueAt = scheduledAt; urgency by visit day', async () => {
  // scheduled tomorrow → normal; today (later hour) → warning; yesterday → overdue
});
it('held: verdict_due / submit_verdict', async () => {});
it('verdict recorded or phase closed: closed / done', async () => {});
it('B5/B1: closed dossier: inactive / dossier_closed, outside the action counts', async () => {});
it('D14: an agent sees only their missions; SU sees every mission; assignedToViewer is per viewer', async () => {
  const a = await user();
  const b = await user();
  // one mission for a, one for b
  const asA = await site.getMyQueue({ userId: a, roles: ['r3_agent'] });
  assert.ok(asA.items.every((i) => i.assignedToViewer));
  assert.equal(
    asA.items.some((i) => i.siteVisit.r3AgentId === b),
    false
  );
  const asSu = await site.getMyQueue({ userId: a, roles: ['SU', 'r3_agent'] });
  assert.ok(asSu.items.some((i) => i.siteVisit.r3AgentId === b && i.assignedToViewer === false));
  assert.ok(asSu.items.some((i) => i.siteVisit.r3AgentId === a && i.assignedToViewer === true));
});
it('no French label in the read model; assignedAgentName is set', async () => {
  /* 'statusLabel' and 'nextActionLabel' absent */
});
it('issues exactly 1 query for an agent and for SU, whatever the number of missions', async () => {});
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `apps/api`, with `DATABASE_URL`): `npx tsx --test --test-concurrency=1 src/modules/site-inspection/site-visit-held.db.test.ts src/modules/site-inspection/site-visit-held.http.test.ts src/modules/site-inspection/inspection-queue.db.test.ts`
Expected: FAIL.

- [ ] **Step 3: Error mapping**

In `shared/utils/error.ts`, inside `handleSiteInspectionError`'s map, after `SITE_VISIT_NOT_HELD`:

```ts
    MEETING_NOT_SCHEDULED: {
      status: 409,
      message: "Cette visite n'est plus au statut planifié.",
    },
    SITE_VISIT_PAYMENT_NOT_VALIDATED: {
      status: 409,
      message: "Le paiement doit être validé par Finance avant d'enregistrer la tenue de la visite.",
    },
```

Check that the handler puts the code in the response body (`code`) the same way it does for `DOSSIER_CLOSED`; if it only sends `message`, assert on the message in the HTTP test instead of `code`.

- [ ] **Step 4: The guard**

Replace the body of `markAssignedSiteVisitHeld` after `assertMeetingDossierOpen`:

```ts
const [row] = await db
  .select({ visit: meetings, payment: payments })
  .from(meetings)
  .leftJoin(payments, eq(payments.phaseId, meetings.phaseId))
  .where(
    and(
      eq(meetings.id, meetingId),
      eq(meetings.meetingType, 'site_visit'),
      eq(meetings.dnAgentId, r3AgentId)
    )
  );
if (!row) throw new Error('SITE_VISIT_NOT_ASSIGNED');
if (row.visit.status !== 'scheduled') throw new Error('MEETING_NOT_SCHEDULED');
// B4 - a visit is recorded as held only once its M6 payment is validated.
if (!canRecordSiteVisitHeld(row.visit, row.payment))
  throw new Error('SITE_VISIT_PAYMENT_NOT_VALIDATED');

// Compare-and-set: a concurrent call that already moved the visit gets no row.
const [updated] = await db
  .update(meetings)
  .set({ status: 'held' })
  .where(and(eq(meetings.id, meetingId), eq(meetings.status, 'scheduled')))
  .returning();
if (!updated) throw new Error('MEETING_NOT_SCHEDULED');
```

The `logAudit` call and the `return toSiteVisitView(updated)` stay after it.

- [ ] **Step 5: The CI queue**

`site-inspection.types.ts`: delete `MyQueueItem` and add:

```ts
import type {
  InspectionActionKey,
  InspectionBucket,
  OperationalQueue,
  OperationalQueueItem,
} from '@aidn/shared';

export interface InspectionQueueItem extends OperationalQueueItem<
  InspectionBucket,
  InspectionActionKey
> {
  phaseId: number;
  phaseStatus: string;
  requestType: string;
  payment: PaymentView | null;
  siteVisit: SiteVisitView;
  inspection: InspectionView | null;
  /** D11/D14 - the services act only for the assigned agent. */
  assignedToViewer: boolean;
  assignedAgentName: string | null;
}
export type InspectionQueueResponse = OperationalQueue<InspectionQueueItem, InspectionBucket>;
```

In `site-inspection.service.ts`, replace `missionState` and `getMyQueue`:

```ts
type QueueRow = {
  phaseId: number;
  phaseStatus: string;
  requestId: number;
  requestReference: string;
  requestType: string;
  requestStatus: string;
  organisationName: string;
  agentName: string | null;
  payment: typeof payments.$inferSelect | null;
  siteVisit: typeof meetings.$inferSelect;
  inspection: typeof siteInspections.$inferSelect | null;
};
type Op = Pick<
  InspectionQueueItem,
  'bucket' | 'state' | 'owner' | 'actionKey' | 'blockReason' | 'urgency' | 'dueAt'
>;

export function buildInspectionItem(
  row: QueueRow,
  viewerId: number,
  now: Date
): InspectionQueueItem {
  const flags = dossierFlags(row.requestStatus);
  const done = (bucket: 'closed' | 'inactive', blockReason: Op['blockReason']): Op => ({
    bucket,
    state: 'done',
    owner: null,
    actionKey: 'none',
    blockReason,
    urgency: 'normal',
    dueAt: null,
  });
  let op: Op;
  if (flags.dossierClosed) op = done('inactive', 'dossier_closed');
  else if (row.inspection || row.phaseStatus === 'closed') op = done('closed', null);
  else if (row.payment?.status !== 'validated') {
    op = {
      bucket: 'awaiting_payment',
      state: 'blocked',
      actionKey: 'await_payment',
      blockReason: 'payment_not_validated',
      urgency: 'normal',
      dueAt: null,
      owner:
        row.payment?.status === 'awaiting_proof'
          ? OPERATIONAL_OWNERS.applicant
          : OPERATIONAL_OWNERS.finance,
    };
  } else if (canRecordSiteVisitHeld(row.siteVisit, row.payment)) {
    op = {
      bucket: 'to_hold',
      state: 'action_required',
      owner: OPERATIONAL_OWNERS.inspection,
      actionKey: 'record_visit_held',
      blockReason: null,
      urgency: visitDayUrgency(row.siteVisit.scheduledAt, now),
      dueAt: row.siteVisit.scheduledAt.toISOString(),
    };
  } else if (row.siteVisit.status === 'held') {
    op = {
      bucket: 'verdict_due',
      state: 'action_required',
      owner: OPERATIONAL_OWNERS.inspection,
      actionKey: 'submit_verdict',
      blockReason: null,
      urgency: 'normal',
      dueAt: null,
    };
  } else op = done('inactive', null); // no_show, file_cancelled...
  return {
    id: `M6:${row.phaseId}`,
    requestId: row.requestId,
    requestReference: row.requestReference,
    organisationName: row.organisationName,
    ...op,
    stepSince: (row.inspection?.submittedAt ?? row.siteVisit.scheduledAt).toISOString(),
    ...flags,
    phaseId: row.phaseId,
    phaseStatus: row.phaseStatus,
    requestType: row.requestType,
    payment: row.payment ? toPaymentView(row.payment) : null,
    siteVisit: toSiteVisitView(row.siteVisit),
    inspection: row.inspection ? toInspectionView(row.inspection) : null,
    assignedToViewer: row.siteVisit.dnAgentId === viewerId,
    assignedAgentName: row.agentName,
  };
}

/** D14 - an agent sees the missions assigned to them; SU sees every mission.
 *  One query either way. */
export async function getMyQueue(
  viewer: { userId: number; roles: readonly string[] },
  now: Date = new Date()
): Promise<InspectionQueueResponse> {
  const seeAll = viewer.roles.includes('SU');
  const rows = await db
    .select({
      phaseId: phases.id,
      phaseStatus: phases.status,
      requestId: requests.id,
      requestReference: requests.reference,
      requestType: requests.requestType,
      requestStatus: requests.status,
      organisationName: organisations.name,
      agentName: users.fullName,
      payment: payments,
      siteVisit: meetings,
      inspection: siteInspections,
    })
    .from(meetings)
    .innerJoin(phases, eq(meetings.phaseId, phases.id))
    .innerJoin(requests, eq(phases.requestId, requests.id))
    .innerJoin(organisations, eq(requests.organisationId, organisations.id))
    .leftJoin(users, eq(users.id, meetings.dnAgentId))
    .leftJoin(payments, eq(payments.phaseId, phases.id))
    .leftJoin(siteInspections, eq(siteInspections.phaseId, phases.id))
    .where(
      and(
        eq(phases.phaseCode, 'M6'),
        eq(meetings.meetingType, 'site_visit'),
        // One row per dossier: a superseded visit would list it twice.
        ne(meetings.status, 'rescheduled'),
        seeAll ? undefined : eq(meetings.dnAgentId, viewer.userId)
      )
    )
    .orderBy(desc(meetings.scheduledAt));
  const items = rows.map((row) => buildInspectionItem(row, viewer.userId, now));
  return { items, counts: countBuckets(INSPECTION_BUCKETS, items) };
}
```

Imports to add:

- `users` from the schema;
- `INSPECTION_BUCKETS`, `OPERATIONAL_OWNERS`, `canRecordSiteVisitHeld`, `countBuckets` and `visitDayUrgency` from `@aidn/shared`;
- the new types.

Delete the old `daysBetween`, if nothing else in the file uses it.

In `site-inspection.controller.ts`: `inspectionService.getMyQueue({ userId: req.user!.userId, roles: req.user!.roles })`.

In `closed-dossier-lists.db.test.ts`:

- `mission: mine((await m.site.getMyQueue({ userId: d.user, roles: ['r3_agent'] })).items)`;
- closed: `assert.equal(l.mission.bucket, 'inactive'); assert.equal(l.mission.actionKey, 'none');`;
- open: `assert.equal(l.mission.bucket, 'to_hold'); assert.equal(l.mission.actionKey, 'record_visit_held');`.

The open fixture must have a validated payment for `to_hold`; if it does not, expect `awaiting_payment` / `await_payment`, which is what B4 now requires.

- [ ] **Step 6: Run the tests**

Run (from `apps/api`, with `DATABASE_URL`): the three new files, `src/modules/requests/closed-dossier-lists.db.test.ts`, `src/modules/site-inspection/site-visit-reschedule.invariant.test.ts`; then `npm run typecheck --workspace=apps/api`.
Expected: PASS. The retired R3 dashboard service still compiles until Task 11 (it does not import `MyQueueItem`; if it does, replace the import with `InspectionQueueItem` or leave the deletion to Task 11 and fix the compile only).

---

### Task 10: Cellule Inspection cockpit (admin)

**Files:**

- Modify: `apps/admin/src/lib/api/site-inspection.types.ts` (replace `MyQueueItem` with `InspectionQueueItem` / `InspectionQueueResponse`, ISO strings), `site-inspection.api.ts` (`fetchMyQueue(): Promise<InspectionQueueResponse>`)
- Create: `apps/admin/src/pages/inspections/inspectionCopy.ts`, `InspectionPane.tsx`
- Rewrite: `apps/admin/src/pages/inspections/MyInspectionsPage.tsx`, `MyInspectionsPage.test.tsx`
- Update: `apps/admin/src/pages/closed-dossier-lists.test.tsx` (`<MyInspectionsPage>` block)
- Test: `apps/admin/src/pages/inspections/inspectionCopy.test.ts`

**Interfaces:**

- Consumes: Tasks 1, 2 and 9.
- Produces: `INSPECTION_TABS`, `inspectionCallout(item)`, `inspectionMetrics(items, counts)`, `InspectionPane`.

- [ ] **Step 1: Write the failing tests**

`inspectionCopy.test.ts`:

```ts
it('callouts', () => {
  const blocked = inspectionCallout(
    mission({
      bucket: 'awaiting_payment',
      actionKey: 'await_payment',
      state: 'blocked',
      blockReason: 'payment_not_validated',
      owner: OPERATIONAL_OWNERS.finance,
    })
  );
  expect(blocked.title).toBe('Paiement en attente');
  expect(blocked.blockReason).toBe(
    'La visite pourra être enregistrée une fois le paiement validé par Finance.'
  );
  expect(inspectionCallout(mission({ actionKey: 'record_visit_held' })).title).toBe(
    'Visite à enregistrer'
  );
  expect(
    inspectionCallout(mission({ actionKey: 'submit_verdict', bucket: 'verdict_due' })).description
  ).toBe("La visite est tenue. L'avis d'inspection doit être enregistré.");
});
it('metrics: « Visites à enregistrer » counts the overdue ones as « passées »; inactive never read', () => {});
```

`MyInspectionsPage.test.tsx` (rewrite) seeds `queryKeys.siteInspection.myQueue()` with `{ items, counts }` and uses a mutable roles mock:

```tsx
it('lands on « Visites à enregistrer »; the assigned agent gets « Enregistrer la tenue »', ...);
it('an unpaid mission shows « Paiement en attente », owner Finance or Postulant, and no « Enregistrer la tenue »; its tab groups it under « En attente »', ...);
it('SU sees a mission assigned to another agent without any CTA; with their own assignment, the CTA appears', () => {
  roles = ['SU', 'r3_agent'];
  // item A: assignedToViewer false → no button; item B: assignedToViewer true → button
});
it('verdict form only in « Avis à rendre » for the assigned agent; submit posts the verdict', ...);
it('the 7-day strip filters the list', ...);
it('a visit due today shows « Échéance proche », a past one « En retard »', ...);
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `apps/admin`): `npx vitest run src/pages/inspections`
Expected: FAIL.

- [ ] **Step 3: `inspectionCopy.ts`**

```ts
import type { InspectionBucket } from '@aidn/shared';
import type { InspectionQueueItem } from '../../lib/api/site-inspection.types';
import type { CockpitMetric } from '../../components/cockpit/CockpitMetrics';
import type { QueueMode } from '../../lib/cockpit/queue';

export type InspectionTab = Exclude<InspectionBucket, 'inactive'> | 'all';
export const INSPECTION_TABS: Array<{ key: InspectionTab; label: string }> = [
  { key: 'to_hold', label: 'Visites à enregistrer' },
  { key: 'verdict_due', label: 'Avis à rendre' },
  { key: 'awaiting_payment', label: 'Paiement en attente' },
  { key: 'closed', label: 'Clôturées' },
  { key: 'all', label: 'Tous' },
];
export const INSPECTION_TAB_MODES: Record<InspectionTab, QueueMode> = {
  to_hold: 'action',
  verdict_due: 'action',
  awaiting_payment: 'waiting',
  closed: 'history',
  all: 'history',
};

export function inspectionCallout(item: InspectionQueueItem): {
  title: string;
  description: string;
  blockReason: string | null;
} {
  if (item.blockReason === 'dossier_closed')
    return {
      title: 'Dossier clos - consultation uniquement',
      description:
        'La mission reste consultable. Aucune action de la Cellule Inspection n’est possible.',
      blockReason: null,
    };
  switch (item.actionKey) {
    case 'await_payment':
      return {
        title: 'Paiement en attente',
        description:
          'La visite peut être planifiée, mais pas enregistrée avant la validation du paiement.',
        blockReason: 'La visite pourra être enregistrée une fois le paiement validé par Finance.',
      };
    case 'record_visit_held':
      return {
        title: 'Visite à enregistrer',
        description: 'Enregistrez la tenue de la visite une fois celle-ci effectuée.',
        blockReason: null,
      };
    case 'submit_verdict':
      return {
        title: "Avis d'inspection à rendre",
        description: "La visite est tenue. L'avis d'inspection doit être enregistré.",
        blockReason: null,
      };
    default:
      return item.bucket === 'closed'
        ? {
            title: 'Mission clôturée',
            description: "L'avis d'inspection est enregistré.",
            blockReason: null,
          }
        : { title: 'Visite non tenue', description: 'Consultation uniquement.', blockReason: null };
  }
}

export function inspectionMetrics(
  items: InspectionQueueItem[],
  counts: Record<InspectionBucket, number>
): CockpitMetric[] {
  const past = items.filter((i) => i.bucket === 'to_hold' && i.urgency === 'overdue').length;
  return [
    {
      key: 'to_hold',
      label: 'visites à enregistrer',
      value: counts.to_hold,
      detail: past > 0 ? `dont ${past} passées` : null,
      tone: 'info',
    },
    {
      key: 'verdict_due',
      label: 'avis à rendre',
      value: counts.verdict_due,
      detail: null,
      tone: 'warning',
    },
    {
      key: 'awaiting_payment',
      label: 'paiement en attente',
      value: counts.awaiting_payment,
      detail: null,
      tone: 'neutral',
    },
  ];
}
```

- [ ] **Step 4: Pane and page**

`InspectionPane.tsx` is a `QueueReadingPane`:

- **Header:** reference, organisation, the `formatDateTime(siteVisit.scheduledAt)` and location lines from the old panel, `ClosedDossierBadge`, and the « Agent CI : {assignedAgentName} » line when `roles` includes `SU`.
- **Callout:** `inspectionCallout`, with `canAct: canAct(owner, roles) && item.assignedToViewer && !!cta`.
- **`cta`:**
  - `record_visit_held` → « Enregistrer la tenue » (the existing `markHeldMutation`, moved unchanged);
  - `submit_verdict` → the existing verdict form (moved unchanged: zod schema, `VERDICT_LABELS`, note required), rendered as the CTA content.
- **`secondary`:** « Ouvrir la mission » (`/demandes/${requestId}/demonstration-inspection`).
- **Body:** « Détails de la mission » (`Info` rows: type, « Paiement » via the existing `paymentLabel` with « Validation Finance attendue » kept, « Visite » via `visitLabel` with the accents fixed to « Reprogrammée », « Avis d’inspection »), « Avancement » (the existing `ProgressStep` list) and « Avis soumis » when `inspection`.
- **Removed:** `blockedReason` (the callout replaces it).

`MyInspectionsPage.tsx` follows the `CourrierTasksPage` structure:

- query `queryKeys.siteInspection.myQueue()` with `fetchMyQueue`; tabs `INSPECTION_TABS`, default `'to_hold'`, `mode = INSPECTION_TAB_MODES[tab]`, `useUrlSelection(visible, !query.isLoading)`;
- title « Mes inspections » (when `roles` includes `SU`: « Inspections - Cellule Inspection »); metrics `inspectionMetrics`;
- `above` = the existing `CalendarStrip` (moved unchanged with `buildSevenDayStrip` and `dayKey`), filtering `visible` by `selectedDay` after `filterQueue`;
- search haystack `[requestReference, organisationName, siteVisit.location ?? '']`;
- row: organisation + `formatRowDate(siteVisit.scheduledAt)`, reference + location, badges (`ClosedDossierBadge`, and `AgingBadge` with `urgency` and `dueAt` in `to_hold`), then the callout title.

Remove:

- the table, the status `<select>` and the local `MetricCard`;
- `STATUS_LABELS`, `STATUS_STYLES`, `PRIORITY_*`, `MissionBadges`, `blockedReason`.

- [ ] **Step 5: Update `closed-dossier-lists.test.tsx`**

The `<MyInspectionsPage>` block:

- sets `roles = ['r3_agent']`;
- seeds `{ items, counts }`;
- closed case: an item with `bucket: 'inactive'` and `dossierClosed: true` under `?tab=all` shows the closed badge and no « Enregistrer la tenue »;
- open case: an item with `bucket: 'to_hold'`, `assignedToViewer: true`, `owner: OPERATIONAL_OWNERS.inspection` shows the button.

- [ ] **Step 6: Run the tests**

Run (from `apps/admin`): `npx vitest run src/pages/inspections src/pages/closed-dossier-lists.test.tsx`, then `npx vitest run`, then `npm run typecheck --workspace=apps/admin`.
Expected: PASS.

---

### Task 11: API dashboard deletions, test migrations, docs, full validation and the commit

**Files:**

- Modify: `apps/api/src/modules/dashboard/dashboard.service.ts`, `dashboard.controller.ts`, `dashboard.route.ts`, `dashboard.types.ts`
- Modify: `apps/api/src/modules/dn-annotation/dn-annotation.db.test.ts:305-311`, `apps/api/src/modules/meetings/meeting-negotiation.db.test.ts:175-190`
- Test: `apps/api/src/modules/dashboard/dashboard.routes.test.ts`
- Docs: `docs/superpowers/specs/2026-10-16-session1-cockpit-1-design.md` (status), `exploration-cache/project/decisions.md` (#20), `exploration-cache/changelog.md`, `exploration-cache/active-session/current-task.md`

**Interfaces:**

- Consumes: everything above.
- Produces: the single feature commit.

- [ ] **Step 1: Write the failing route test**

`dashboard.routes.test.ts` (no database) inspects the router stack:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dashboardRoute from './dashboard.route.js';

describe('dashboard routes (SESSION1-COCKPIT-1)', () => {
  it('keeps /summary only; the role summaries are gone', () => {
    const paths = (
      dashboardRoute as unknown as { stack: Array<{ route?: { path: string } }> }
    ).stack
      .map((layer) => layer.route?.path)
      .filter(Boolean);
    assert.deepEqual(paths, ['/summary']);
  });
});
```

Run (from `apps/api`): `npx tsx --test src/modules/dashboard/dashboard.routes.test.ts`. Expected: FAIL (four paths).

- [ ] **Step 2: Delete the role summaries**

- **`dashboard.route.ts`:** remove the `/s5-summary`, `/reception-summary` and `/r3-summary` lines. The router-level `requireRole(...)` stays unchanged (no auth change).
- **`dashboard.controller.ts`:** remove `s5Summary`, `receptionSummary` and `r3Summary`, and their imports.
- **`dashboard.service.ts`:** remove `getS5DashboardSummary`, `getReceptionDashboardSummary` and `getR3DashboardSummary`. Then remove every private helper, constant and label map that no remaining code uses. Candidates: `s5WaitingFrom`, `s5WaitingDays`, `s5Priority`, `receptionWaitingFrom`, `s5ActivityLabel`, `receptionActivityLabel`, `r3ActivityLabel`, `S5_PAYMENT_STATUS_LABELS`, `S5_PAYMENT_ACTION_LABELS`, `RECEPTION_CIRCUIT_*`, `R3_MISSION_STATUS_LABELS`, `waitingLabel`, `workingDaysSince`, `average`, `percent`, `priorityFromAge`. Check each with `rg -n "<name>" apps/api/src/modules/dashboard/dashboard.service.ts` before deleting; `getDashboardSummary` must stay byte-identical in behaviour.
- **`dashboard.types.ts`:** remove the `S5Dashboard*`, `ReceptionDashboard*` and `R3Dashboard*` types.

- [ ] **Step 3: Migrate the two dependent tests**

- **`dn-annotation.db.test.ts`** « the reception dashboard counts the DG circuits only »: rename it « the courrier queue counts the DG circuits only ». Assert that `listCourrierTasks({})` contains the dossier's `intake_request` row and no row with id `dn_director_annotation:<request>`, and that `counts.returned` counts only DG circuits.
- **`meeting-negotiation.db.test.ts`**, the block calling `getR3DashboardSummary`: keep its fixture and replace the dashboard read with a direct audit assertion:

```ts
const audit = await one(
  `SELECT user_id, details->>'dnAgentId' AS agent FROM audit_logs WHERE action = 'MEETING_SCHEDULED' AND entity_id = $1 ORDER BY id DESC LIMIT 1`,
  [meetingId]
);
assert.equal(Number(audit.agent), r3);
const queue = await site.getMyQueue({ userId: r3, roles: ['r3_agent'] });
assert.ok(queue.items.some((item) => item.siteVisit.id === meetingId));
```

Import the site-inspection service as `site` at the top of the file, the same way it imports `dashboard` today, and remove the `dashboard` import if it is unused.

- [ ] **Step 4: Docs**

- **Spec status:** « implemented and validated (2026-10-16) ».
- **`decisions.md` #20 « Role cockpits are their work queues (SESSION1-COCKPIT-1) »**, 10–15 lines:
  - the shared contract in `@aidn/shared` and the domain read models (Option C);
  - `items` / `counts` semantics with `inactive`;
  - the role dashboards retired, with the overview kept as queue metrics computed from rows (no `audit_logs` query);
  - `homeFor` precedence;
  - B4 (held requires a validated payment; compare-and-set; `SITE_VISIT_PAYMENT_NOT_VALIDATED` / `MEETING_NOT_SCHEDULED` 409);
  - D7 « Annotation du DG »;
  - D8 « preuve de paiement »;
  - the Finance list unbounded as before (follow-up: server-side history window);
  - the portal DG wording as a follow-up.
- **`changelog.md`:** a 2026-10-16 COCKPIT-1 entry (what changed for each role; B1–B6; deleted endpoints).
- **`current-task.md`:** add the COCKPIT-1 line.

- [ ] **Step 5: Full validation matrix**

Run and record each result:

1. `npm run build --workspace=packages/shared`
2. From `apps/api`, with `DATABASE_URL` on the disposable DB: `npx tsx --test --test-concurrency=1 "src/**/*.test.ts"`. Expected: all pass, except the known Windows K8b `spawn npx ENOENT` in the `db:check:certificates` test (report it if present).
3. `npm run test --workspace=apps/admin`. Expected: all pass.
4. `npm run test --workspace=apps/portal`. Expected: all pass (untouched).
5. `npm run typecheck --workspaces --if-present`, `npm run build --workspaces --if-present`, `npm run lint --workspaces --if-present`. Expected: exit 0.
6. `npm run db:check:replayable --workspace=apps/api` and `npm run db:check:committed --workspace=apps/api`. Expected: OK (no migration).
7. `rg -n "S5|R3" apps/admin/src --glob '*.tsx' | rg -v "import|S5[A-Z]|R3[A-Z]|//|\*"`. Expected: no visible user-facing « S5 » or « R3 ».
8. `rg -n "quittance|Retour signé|Courrier DN|circuit signature|Circuit signature" apps/admin/src apps/api/src`. Expected: only « Retour signé enregistré » (M7 certificate), the DN analytics helper text, and tests asserting absence.

- [ ] **Step 6: The single commit (no push)**

```bash
git add packages/shared apps/api apps/admin docs/superpowers/specs/2026-10-16-session1-cockpit-1-design.md docs/superpowers/plans/2026-10-16-session1-cockpit-1.md exploration-cache/project/decisions.md exploration-cache/changelog.md exploration-cache/active-session/current-task.md
git status --short   # exploration-cache/reference/* must NOT be staged
git commit -m "$(cat <<'EOF'
feat(cockpit): role work queues as home cockpits with a shared operational contract

Réception / Assistant DG, Assistante DN, Finance and Cellule Inspection land
on their queue; server-computed bucket, owner, action key and urgency; role
dashboards retired; B1-B6 fixed (site visit held requires a validated payment).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
git log --oneline -1
```

Do not push.

---

## Self-review notes (for the executor)

- **Spec → task map:**

  | Spec                | Task                            |
  | ------------------- | ------------------------------- |
  | §4                  | 1                               |
  | §5.1                | 4, 5                            |
  | §5.2                | 6                               |
  | §5.3                | 7, 8                            |
  | §5.4                | 9, 10                           |
  | §6                  | 1, 2, 4, 7, 9                   |
  | §7.1                | 4                               |
  | §7.2                | 6                               |
  | §7.3 (caller audit) | 7 step 1                        |
  | §7.4                | 9                               |
  | §8                  | 9                               |
  | §9                  | 3                               |
  | §10                 | 2 + each page task              |
  | §11                 | 3 (admin), 11 (API)             |
  | §12                 | 3, 5, 6, 8, 10                  |
  | §13                 | query-count tests in 4, 6, 7, 9 |
  | §14                 | every task                      |

- **Names reused across tasks:** `OPERATIONAL_OWNERS`, `countBuckets`, `urgencyFromAge`, `visitDayUrgency`, `canRecordSiteVisitHeld`, `loadThresholds`, `calendarDaysSince`, `sortQueue`, `groupQueue`, `filterQueue`, `defaultOrderFor`, `useUrlSelection`, `useQueueTab`, `courrierDefaultTab`, `homeFor`, `queryKeys.courrierTasks.queue()`, `queryKeys.dnCircuit.queue()`, `queryKeys.payments.financeQueue()`, `queryKeys.siteInspection.myQueue()`.
