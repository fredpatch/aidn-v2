# SESSION1-COCKPIT-1 - Operational cockpits per role

**Status**: implemented and validated (2026-10-16)
**Date**: 2026-10-16
**Depends on**: SESSION1-UX-1 (`a4e353d`)
**Out of scope**:

- the applicant portal (including its DG-circuit wording, §15);
- ACCOUNT-1;
- notifications and e-mail;
- auth and role redesign; renaming technical roles, routes or files (`s5_agent`, `r3_agent`, `/paiements-s5`, `S5PaymentsPage`, `R3…`);
- the DN dashboard and analytics;
- the M4 conditional-documents work;
- the timestamp parser follow-up;
- any migration.

## 1. Problem

Réception / Assistant DG, Assistante DN, Finance and Cellule Inspection each have a work queue, and three of them also have a "dashboard" that re-derives the same states separately. The two copies disagree:

- the dashboards count and push actions on closed dossiers (B1);
- the Finance invoice delay can never fire (B2);
- Finance treats a rejected dossier as work to do (B3);
- the CI dashboard runs a second, partly unreachable state machine (B5);
- the courrier page sends initial requests « à la DN » instead of to the Assistante DN (B6);
- the API lets a CI agent record a visit as held before the payment is validated, while the UI forbids it (B4).

None of these screens uses the UX-1 operational language (`OperationalCallout`, a named owner, `canAct`).

**Goal.** For every operational role, one home cockpit that answers at a glance:

1. what needs my action now;
2. what waits on someone else;
3. what is urgent or old;
4. which item to open;
5. which action opening it leads to.

The cockpit is built from a shared presentation shell and domain-owned read models.

## 2. Frozen decisions

| #   | Decision                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | The Réception, Finance and CI dashboards are retired. Their useful overview (counts per step, overdue counts, urgency ordering, upcoming visits, recent throughput) moves into the queue page, which becomes the role's home. |
| D2  | `CircuitDirecteurDnPage` is the Assistante DN cockpit. No separate dashboard.                                                                                                                                                 |
| D3  | Hybrid API: a shared operational contract (§4) carried by domain-specific read models and endpoints.                                                                                                                          |
| D4  | Finance and CI move to the shared two-pane layout. The pagination ruling is in §7.3.                                                                                                                                          |
| D5  | Réception and Assistant DG share one Courriers queue. Default tab: Réception « À imprimer », Assistant DG « Retour DG attendu » (§9).                                                                                         |
| D6  | B1, B2, B3, B5 and B6 are fixed here.                                                                                                                                                                                         |
| D7  | « Annotation du DG » for the initial request, M3 declaration and M4 applicant letter circuits. « Signature » only for documents genuinely signed as formal ANAC outputs (certificates, signed meeting reports).               |
| D8  | Visible wording « preuve de paiement ».                                                                                                                                                                                       |
| D9  | B4 is fixed here (§8).                                                                                                                                                                                                        |
| D10 | Urgency comes only from existing parameters and rules (§6). The invented « + 4 j » proof rule is removed. Directeur DN aging stays informational.                                                                             |
| D11 | SU actionability follows the real backend guards and UX-1 `canAct`.                                                                                                                                                           |
| D12 | A pure, tested `homeFor(roles)` decides each user's home (§9). No role selector.                                                                                                                                              |
| D13 | Operational read models send semantic keys, never French labels.                                                                                                                                                              |
| D14 | `r3_agent` sees its assigned missions; SU sees all CI missions. API guards stay authoritative: SU is not made artificially read-only, and SU gets no CTA the API would refuse (§7.4).                                         |
| R1  | `owner` means the actor expected to perform the current step.                                                                                                                                                                 |
| R2  | Domain-specific fields stay outside the shared base contract.                                                                                                                                                                 |
| R3  | Header metrics come from the queue rows and counts only. A « 30 j » metric is allowed only when the dates are already in the rows; otherwise the metric is instantaneous.                                                     |

## 3. Glossary of the four domains

| Domain       | Technical role(s)           | Visible name                  | Page (route unchanged)                            |
| ------------ | --------------------------- | ----------------------------- | ------------------------------------------------- |
| `courriers`  | `reception`, `assistant_dg` | Réception / Assistant DG      | `/courriers`, `CourrierTasksPage`                 |
| `dnCircuit`  | `assistant_dn`              | Assistante DN                 | `/circuit-directeur-dn`, `CircuitDirecteurDnPage` |
| `finance`    | `s5_agent`                  | Finance / Agent Finance       | `/paiements-s5`, `S5PaymentsPage`                 |
| `inspection` | `r3_agent`                  | Cellule Inspection / Agent CI | `/mes-inspections`, `MyInspectionsPage`           |

## 4. Shared operational contract (`packages/shared/src/operational-queue.ts`)

```ts
import type { NextActionOwner, OperationalState } from './applicant-actions'; // UX-1

export type OperationalUrgency = 'normal' | 'warning' | 'overdue';

/** Why an item cannot progress. `null` when it can. */
export type OperationalBlockReason =
  | 'dossier_closed' // K7: read-only dossier
  | 'phase_not_open' // courriers: the M3/M4 phase is not open
  | 'payment_not_validated'; // inspection: the visit cannot be recorded as held yet (§8)

/**
 * One row of a role work queue. B = the domain's bucket union, K = its
 * action-key union. Domains extend this interface with their own fields (R2).
 */
export interface OperationalQueueItem<B extends string, K extends string> {
  /** Stable row key, unique within the queue (also the `?id=` value). */
  id: string;
  requestId: number;
  requestReference: string;
  organisationName: string;
  /** Server-computed queue bucket; the closed and blocked rules are already applied. */
  bucket: B;
  state: OperationalState;
  /** R1: the actor expected to perform the current step; null when the item is done or inactive. */
  owner: NextActionOwner | null;
  /** The current step; the admin app maps it to French (D13). */
  actionKey: K;
  blockReason: OperationalBlockReason | null;
  urgency: OperationalUrgency;
  /** ISO time the item reached its current step (drives the age display and FIFO). */
  stepSince: string | null;
  /** ISO due time, only where a real date exists (a scheduled visit). Never derived from an SLA. */
  dueAt: string | null;
  dossierClosed: boolean;
  dossierStatus: string;
}

export interface OperationalQueue<I extends OperationalQueueItem<B, string>, B extends string> {
  items: I[];
  /** Every bucket key, always present (stable contract), computed on the same
   *  rows (no extra query). counts.inactive counts the inactive rows, but it is
   *  never used by a metric, a tab badge or an action count (§4 rules). */
  counts: Record<B, number>;
}

/** Shared urgency helper: the existing dashboard rule (slaStatusFromWaitingDays),
 *  moved here unchanged. age > target → overdue; age ≥ max(target − 1, 1) →
 *  warning; else normal. A null age is normal. */
export function urgencyFromAge(age: number | null, targetDays: number): OperationalUrgency;

/** Single source of the operational owners (UX-1 residual: the API cockpit and
 *  the admin had identical copies). roles = the requireRole(...) list of the
 *  route performing the step, verbatim. */
export const OPERATIONAL_OWNERS: {
  dn: NextActionOwner; // ['dn_agent','dn_supervisor','SU']
  reception: NextActionOwner; // label 'Réception',     ['assistant_dg','reception','SU']
  assistantDg: NextActionOwner; // label 'Assistant DG',  ['assistant_dg','reception','SU']
  assistantDn: NextActionOwner; // label 'Assistante DN', ['assistant_dn','SU']
  finance: NextActionOwner; // label 'Finance',       ['s5_agent','SU']
  inspection: NextActionOwner; // label 'Cellule Inspection', ['r3_agent','SU']
  applicant: NextActionOwner; // kind 'applicant', label 'Postulant'
};
```

**Rules**

- **Bucket `inactive`.** Every domain union has it. An item whose step can never be performed (closed dossier, phase not open, legacy history) goes there. It appears only under the client-side « Tous » tab and in no action count.
- **`items` and `counts` semantics (frozen).**
  - `items` contains every row, `inactive` ones included, so a closed dossier stays viewable under « Tous ».
  - `counts` always has every bucket key of the domain; `counts.inactive` may be non-zero.
  - `counts.inactive` is never used: no header metric, tab badge, « dont n en retard » or action count reads it. « Tous » counts `items.length`.
  - Every business or actionable count (« À imprimer », « Preuves à valider », …) reads only its own action bucket, so an inactive row never inflates it. Its `owner` is `null`, except `phase_not_open`, whose owner is the DN (the actor who can unblock it by opening the phase).
- **`canAct` and links stay on the client.** No `canAct` or `href` in the contract: the client computes `canAct(owner, roles)` (UX-1) and builds routes. One domain refinement exists, CI `assignedToViewer` (§7.4).
- **Reuse of `OPERATIONAL_OWNERS`.** `apps/api/src/modules/requests/cockpit-next-action.ts` and `apps/admin/src/pages/phases/owners.ts` import `OPERATIONAL_OWNERS` instead of their local copies; the values are unchanged.

## 5. Domain buckets and action keys

States, owners and urgency for every row are listed below. **Tabs** are the client views; `all` (« Tous ») is a client tab over every item and is not a bucket.

### 5.1 Courriers (`CourrierQueueItem`)

```ts
export type CourrierBucket = 'to_print' | 'with_dg' | 'returned' | 'inactive';
export type CourrierActionKey =
  | 'print_for_dg' // print, then put into the DG circuit
  | 'record_dg_annotation' // scan the DG-annotated return
  | 'handed_to_assistant_dn' // initial request: next step is the Directeur DN circuit (B6)
  | 'handed_to_dn' // M3 declaration / M4 letter: next step is DN
  | 'none';
```

| Circuit status, conditions                    | bucket     | state             | owner       | actionKey                            | urgency                                                                                 |
| --------------------------------------------- | ---------- | ----------------- | ----------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| `submitted`, open, phase open (or not phased) | `to_print` | `action_required` | reception   | `print_for_dg`                       | `urgencyFromAge(calendar days since depositedAt, dashboard_sla_signature_deposit_days)` |
| `in_signature_circuit`, open, phase open      | `with_dg`  | `waiting`         | assistantDg | `record_dg_annotation`               | `urgencyFromAge(working days since signatureSentAt, dg_circuit_alert_days)`             |
| `pending_review`, source `intake_request`     | `returned` | `done`            | null        | `handed_to_assistant_dn`             | normal                                                                                  |
| `pending_review`, other sources               | `returned` | `done`            | null        | `handed_to_dn`                       | normal                                                                                  |
| pending, phase not open                       | `inactive` | `blocked`         | dn          | `none`, blockReason `phase_not_open` | normal                                                                                  |
| pending, dossier closed                       | `inactive` | `done`            | null        | `none`, blockReason `dossier_closed` | normal                                                                                  |
| `signed` (legacy)                             | `inactive` | `done`            | null        | `none`                               | normal                                                                                  |

- **Overdue rule.** For `with_dg`, `overdue` is exactly the existing `signatureLate` rule; `warning` is the existing one-step-before rule.
- **Tabs.** « À imprimer » (`to_print`), « Retour DG attendu » (`with_dg`), « Retours enregistrés » (`returned`), « Tous ».
- **Domain fields kept.** `source`, `requestType`, `applicantName`, `circuitStep` (`'deposited' | 'with_dg' | 'returned' | 'legacy_signed'`, the former `bucket` values, for the stepper), `depositedAt`, `signatureSentAt`, `signedAt`, `pendingReviewAt`, `fileUrl`, `availableActions`, `signatureWorkingDays`.
- **Response.** `{ items, counts, thresholds: { dgAlertWorkingDays, depositDays } }`; the thresholds are used only for the hint text.

### 5.2 Circuit Directeur DN (`DnCircuitQueueItem`)

```ts
export type DnCircuitBucket = 'to_send' | 'with_director' | 'returned' | 'inactive';
export type DnCircuitActionKey =
  'send_to_director' | 'record_director_annotation' | 'handed_to_dn' | 'none';
```

| Condition                    | bucket          | state             | owner       | actionKey                            | urgency                                                  |
| ---------------------------- | --------------- | ----------------- | ----------- | ------------------------------------ | -------------------------------------------------------- |
| `submitted`, open            | `to_send`       | `action_required` | assistantDn | `send_to_director`                   | normal                                                   |
| `in_signature_circuit`, open | `with_director` | `waiting`         | assistantDn | `record_director_annotation`         | normal (D10: `directorWorkingDays` shown as information) |
| `pending_review`             | `returned`      | `done`            | null        | `handed_to_dn`                       | normal                                                   |
| pending, dossier closed      | `inactive`      | `done`            | null        | `none`, blockReason `dossier_closed` | normal                                                   |

- **Tabs.** « À transmettre », « Chez le Directeur DN », « Transmis à la DN », « Tous ».
- **Closed dossiers.** « Tous » is new: a pending item on a closed dossier is currently unreachable.
- **`statusLabel` removed** (D13).

### 5.3 Finance (`FinanceQueueItem`)

```ts
export type FinanceBucket =
  'invoice_to_send' | 'proof_to_validate' | 'awaiting_applicant' | 'done' | 'inactive';
export type FinanceActionKey =
  'send_invoice' | 'validate_payment_proof' | 'await_payment_proof' | 'none';
```

| Payment status, conditions              | bucket               | state             | owner     | actionKey                            | urgency                                                                             |
| --------------------------------------- | -------------------- | ----------------- | --------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| `awaiting_invoice`, open                | `invoice_to_send`    | `action_required` | finance   | `send_invoice`                       | `urgencyFromAge(days since phase.openedAt, dashboard_sla_invoice_upload_days)` (B2) |
| `pending_validation`, open              | `proof_to_validate`  | `action_required` | finance   | `validate_payment_proof`             | `urgencyFromAge(days since proofUploadedAt, dashboard_sla_payment_validation_days)` |
| `awaiting_proof`, open                  | `awaiting_applicant` | `waiting`         | applicant | `await_payment_proof`                | normal (D10)                                                                        |
| `validated`                             | `done`               | `done`            | null      | `none`                               | normal                                                                              |
| `rejected` (= the dossier was rejected) | `done`               | `done`            | null      | `none`, blockReason `dossier_closed` | normal                                                                              |
| pending status, dossier closed          | `inactive`           | `done`            | null      | `none`, blockReason `dossier_closed` | normal                                                                              |

- **Tabs.** « Factures à transmettre », « Preuves à valider », « En attente du postulant », « Traités », « Tous ».
- **New proof requested (B3).** `newProofRequested = status === 'awaiting_proof' && rejectionReason !== null`. The pane shows « Nouvelle preuve de paiement demandée » with the reason.
- **Domain fields.** `phaseId`, `phaseCode` (`'M5' | 'M6' | 'M7'`), `requestType`, `payment` (the existing `PaymentView`, including `rejectionReason` and `rejectionAction`), `newProofRequested`, `phaseOpenedAt`.

### 5.4 Cellule Inspection (`InspectionQueueItem`)

```ts
export type InspectionBucket =
  'to_hold' | 'verdict_due' | 'awaiting_payment' | 'closed' | 'inactive';
export type InspectionActionKey = 'record_visit_held' | 'submit_verdict' | 'await_payment' | 'none';
```

| Condition (evaluated in this order) | bucket             | state             | owner                                                                                    | actionKey                                            | urgency                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------ | ----------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dossier closed                      | `inactive`         | `done`            | null                                                                                     | `none`, blockReason `dossier_closed`                 | normal                                                                                                                                                                                                                                                                                                                                                     |
| inspection recorded or phase closed | `closed`           | `done`            | null                                                                                     | `none`                                               | normal                                                                                                                                                                                                                                                                                                                                                     |
| payment not `validated`             | `awaiting_payment` | `blocked`         | finance when `awaiting_invoice` or `pending_validation`; applicant when `awaiting_proof` | `await_payment`, blockReason `payment_not_validated` | normal                                                                                                                                                                                                                                                                                                                                                     |
| visit `scheduled`                   | `to_hold`          | `action_required` | inspection                                                                               | `record_visit_held`                                  | `dueAt = scheduledAt`. **overdue** when the visit day is before today (« En retard »); **warning** when the visit day is today (« Échéance proche »); **normal** when it is after today (« Visite prévue »). Frozen ruling: a visit due today is not yet late. This narrows the old `missionState` « moyenne within 2 days » window to the visit day only. |
| visit `held`                        | `verdict_due`      | `action_required` | inspection                                                                               | `submit_verdict`                                     | normal (no SLA exists; the age is informational)                                                                                                                                                                                                                                                                                                           |

- **Tabs.** « Visites à enregistrer », « Avis à rendre », « Paiement en attente », « Clôturées », « Tous ». The 7-day calendar strip stays as a filter.
- **Domain fields.** `phaseId`, `phaseStatus`, `requestType`, `payment` (`PaymentView | null`), `siteVisit` (`SiteVisitView`), `inspection`, `assignedToViewer`, `assignedAgentName`.
- **Removed (D13).** `statusLabel`, `nextActionLabel`, `priority`.
- **One state machine (B5).** The dashboard's separate state machine is deleted with the dashboard. A single derivation function produces this table.

## 6. Urgency and aging

- **Parameters.** Only existing ones: `dg_circuit_alert_days`, `dashboard_sla_signature_deposit_days`, `dashboard_sla_invoice_upload_days`, `dashboard_sla_payment_validation_days` and `public_holidays`. The defaults are those of the current `DASHBOARD_SLA_DEFAULTS`, exported from one module and reused by the DN dashboard unchanged.
- **Batched reads.** The parameters are read with a new `getIntegerValues(keys: string[], fallbacks)`: one `system_parameters` query, plus `getPublicHolidays` where working days are needed.
- **Removed rule.** The `paymentValidationDays + 4` proof rule is deleted (D10).
- **Sort order.** Action tabs sort by urgency (overdue, warning, normal), then by `stepSince`, oldest first. `done` and `inactive` items sort by `stepSince`, newest first. The user's sort select (« Plus ancien / plus récent d'abord ») overrides the age order inside each urgency group.
- **`AgingBadge`** (§10):
  - overdue: danger tone, « En retard · J+n »;
  - warning: warning tone, « Échéance proche »;
  - normal: muted « depuis n j » (or « dans n j » for a future `dueAt`).
    `n` is the day count shown today. For the DG circuit it is working days, labelled « j ouvrés ».
- **Display.** The haute/moyenne/basse priority pills disappear.
- **Day boundaries.** Server-local, as today; the timestamp parser follow-up is out of scope.

## 7. API and read models

### 7.1 Courriers: `GET /api/courrier-tasks` (existing route and guard)

- `buildTaskView` produces `CourrierQueueItem` per §5.1. `counts` is computed with the same rule as `bucket`.
- The `?bucket=` filter accepts the new keys. The admin is its only caller, and it fetches everything.
- Parameters move to `getIntegerValues`.

### 7.2 Circuit Directeur DN: `GET /api/dn-annotation-tasks` (existing)

Items follow §5.2; `statusLabel` is removed and `counts` added.

### 7.3 Finance: new `GET /api/payments/finance-queue`

- **Guard.** `requireRole('s5_agent','SU')`. Lives in `modules/payments/finance-queue.ts`, with a route and controller in the same module.
- **One query.** Joins `phases` → `requests` → `organisations` → `payments` for `phaseCode in ('M5','M6','M7')`, as the retired S5 dashboard did, plus `requests.status` for `dossierFlags`.
- **Caller audit before deletion (required in the plan).** Before removing them, the plan proves with a repository-wide search (API, admin, portal, scripts and tests) that the three per-phase `payment-queue` routes, their service functions, their admin `fetch…PaymentQueue` clients and their `queryKeys.*.paymentQueue()` keys have no consumer other than `S5PaymentsPage`, `queryClient.ts` and the tests being migrated. A consumer found there stops the deletion of that item and is reported.
- **Removed.** The three per-phase `GET …/payment-queue` routes, their controllers, service functions, duplicated `toPaymentView` / `nextPaymentAction` copies (only where nothing else uses them), and their admin clients. `queryClient.ts` invalidates `queryKeys.payments.financeQueue()` instead of the three keys.

**Pagination ruling (D4).**

- **Today it is client-side only.** `paginate()` in `components/ui/pagination.tsx` slices an array that the three endpoints already return in full: unbounded, ordered by `phases.openedAt desc`, no `limit`.
- **Nothing server-side is replaced.** The new endpoint returns the same row set in one call, so dropping the client pagination does not add an unbounded fetch.
- **Bound.** At most 3 payment rows per dossier that reached M5 (one per phase M5/M6/M7). That is acceptable at the current scale.
- **Rendering.** The list is the shared `MessageList` with day groups.
- **Report for later.** If volume grows, a server-side history window for `done` / `inactive` is the follow-up (§15).

### 7.4 CI: `GET /api/site-inspection/my-queue` (existing route, `requireRole('r3_agent','SU')`)

**SU scoping (D14).** `getMyQueue(viewer: { userId; roles })`:

- an `r3_agent` without SU gets `meetings.dnAgentId = userId` (as today);
- SU gets every mission: the same query without the assignee filter, so still one query.

This absorbs the retired dashboard's `includeAll`.

**Actionability (D11).** The mutation services require `meetings.dnAgentId === actor`, so SU can perform a CI step only on a mission assigned to them.

- Each item carries `assignedToViewer = siteVisit.dnAgentId === viewer.userId`.
- The client shows the CTA only when `canAct(owner, roles) && item.assignedToViewer`.
- `owner.roles` stays the route's `requireRole` list (`['r3_agent','SU']`), per the UX-1 owner rule. The assignment check is the domain refinement.
- SU sees all missions and the callout, and gets a CTA exactly when the API would accept the action.

### 7.5 Dashboard module

The admin `/` no longer calls `/summary` for non-DN users (§9), but the `/api/dashboard` guard is left unchanged (no auth change). Deletions are in §11.

## 8. B4 - site visit held requires a validated payment

**Invariant.**

- A site visit may be **scheduled** whatever the payment status (unchanged).
- It may be recorded as **held** only if the payment of its M6 phase is `validated`.
- The verdict keeps its existing payment guard.

**Shared predicate** (`packages/shared/src/operational-queue.ts`, next to the contract):

```ts
export function canRecordSiteVisitHeld(
  visit: { status: string },
  payment: { status: string } | null
): boolean {
  return visit.status === 'scheduled' && payment?.status === 'validated';
}
```

It is used by the service guard and by the §5.4 derivation (`to_hold`), so an item expected in `to_hold` is always accepted by the guard.

**`markAssignedSiteVisitHeld` guard order.** Guards are checked in this order; the first that fails throws.

1. `assertMeetingDossierOpen` → `DOSSIER_CLOSED` (409, existing).
2. Meeting not found, not a site visit, or not assigned to the actor → `SITE_VISIT_NOT_ASSIGNED` (403, existing).
3. Visit status ≠ `scheduled` → `MEETING_NOT_SCHEDULED`. It is currently **unmapped** in `handleSiteInspectionError` (it falls through to 500), so it gets mapped: 409, « Cette visite n'est plus au statut planifié. »
4. Payment of the visit's phase missing or ≠ `validated` → **new** `SITE_VISIT_PAYMENT_NOT_VALIDATED`, 409, « Le paiement doit être validé par Finance avant d'enregistrer la tenue de la visite. »

**Implementation notes.**

- The payment is read in the same `SELECT` as the meeting (left join `payments` on `meetings.phase_id`): no extra statement.
- The update is a compare-and-set: `UPDATE meetings SET status = 'held' WHERE id = ? AND status = 'scheduled' RETURNING *`. **If it returns no row, the service throws `MEETING_NOT_SCHEDULED` (409)** and writes no audit row. Two concurrent clicks on « Enregistrer la tenue » therefore give one 200 and one 409, never a second 200 or an `undefined` view.
- No lock is needed, because `validated` is terminal: no transition leaves it.
- `PAYMENT_NOT_VALIDATED` (verdict) is unchanged.

## 9. Home routing - `homeFor(roles)`

Pure function in `apps/admin/src/lib/home-for.ts`:

```ts
export type Home =
  | { kind: 'dn_dashboard' }
  | {
      kind: 'queue';
      path: '/paiements-s5' | '/mes-inspections' | '/courriers' | '/circuit-directeur-dn';
    }
  | { kind: 'denied' };
export function homeFor(roles: readonly InternalRole[]): Home;
```

| Roles held (any others ignored unless listed) | Home                               |
| --------------------------------------------- | ---------------------------------- |
| `dn_agent` or `dn_supervisor` (with anything) | DN dashboard                       |
| `SU` (with anything)                          | DN dashboard                       |
| only non-DN domains: `s5_agent` ∈ roles       | `/paiements-s5`                    |
| else `r3_agent` ∈ roles                       | `/mes-inspections`                 |
| else `reception` or `assistant_dg` ∈ roles    | `/courriers`                       |
| else `assistant_dn` ∈ roles                   | `/circuit-directeur-dn`            |
| none of the above                             | denied (existing « Accès refusé ») |

- **How the home is reached.** `HomeRoute` renders `DashboardPage` for `dn_dashboard`, and `<Navigate replace>` to the path for `queue`. The redirect keeps `?id=` deep links and highlights the right nav item, as the current Assistante DN redirect already does.
- **Courriers default tab:** `assistant_dg` without `reception` → « Retour DG attendu »; any other viewer, SU included → « À imprimer ». The default applies only when no tab is chosen; a tab picked by the user stays in the URL as `?tab=`.
- **Navigation:** the « Tableau de bord » nav item is limited to `dn_agent`, `dn_supervisor` and `SU`. The other roles reach their queue through its own nav item. The label « Courrier DN » becomes « Circuit Directeur DN ».

## 10. Shared cockpit primitives (admin, presentation only)

These components contain no role checks and no business rules. Pages pass items, copy, buckets and pane bodies.

| File                                        | Responsibility                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/cockpit/CockpitPage.tsx`        | Page frame, eyebrow « Direction de la Navigabilité », title, metric strip slot, search slot (with the `/` shortcut), error banner                                                                                                                                                                                   |
| `components/cockpit/CockpitMetrics.tsx`     | One metric chip/card component: label, value, optional « dont n en retard » sub-value, tone. Replaces the local `S5MetricCard`, the CI `MetricCard` and the header `StatusBadge` chips.                                                                                                                             |
| `components/cockpit/QueueColumn.tsx`        | `BucketTabs` (compact) + sort select + `MessageList` + loading/error/empty `EmptyState` (three distinct messages) + footer (count, keyboard hints)                                                                                                                                                                  |
| `components/cockpit/QueueReadingPane.tsx`   | Pane frame: header (reference, title line, `ClosedDossierBadge`, status chip), then `OperationalCallout`, then children. Empty selection state.                                                                                                                                                                     |
| `components/cockpit/AgingBadge.tsx`         | §6 visual                                                                                                                                                                                                                                                                                                           |
| `components/cockpit/CockpitUploadModal.tsx` | Generic one-file upload dialog. Props: `title`, `subtitle`, `label`, `accept`, `hint?`, `submitLabel`, `busySubmitLabel`, `file`, `busy`, `onFileChange`, `onClose`, `onSubmit`. Used by the courrier DG return, the Directeur DN return and the Finance invoice; the business rules and wording stay in the pages. |
| `lib/cockpit/useUrlSelection.ts`            | `?id=` read/write with fallback to the first visible item                                                                                                                                                                                                                                                           |
| `lib/cockpit/useQueueTab.ts`                | `?tab=` with a default                                                                                                                                                                                                                                                                                              |
| `lib/cockpit/sortQueue.ts`                  | The §6 order, pure                                                                                                                                                                                                                                                                                                  |

- **Domain-owned pieces** (pure and tested):
  - `pages/<domain>/<domain>Copy.ts`: French per `actionKey`, `bucket` and `blockReason`; callout title and description;
  - `pages/<domain>/<domain>Metrics.ts`: the metrics, from items and counts.
- **Domain views kept as children:** the DG circuit stepper, the Finance payment documents and timeline, the CI calendar strip and verdict form, the payment rejection flow (`RejectModal`, `PaymentRejectionForm`).
- **Shared callout rule.**
  - The callout shows `owner` per UX-1.
  - The CTA renders only when `canAct` (with `assignedToViewer` for CI).
  - The secondary navigation always renders.
  - `blockReason` copy shows in every state except `done`, except that `dossier_closed` always shows the read-only message.

### 10.1 Metrics per role (R3: rows and counts only)

| Role                 | Metrics                                                                                                                                                           | Source                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Courriers            | À imprimer (dont _n_ en retard) · Retour DG attendu (dont _n_ en retard, délai moyen j ouvrés) · Retours enregistrés 30 j                                         | counts; urgency; `signatureWorkingDays`; `pendingReviewAt` (in the rows)  |
| Circuit Directeur DN | À transmettre · Chez le Directeur DN (délai moyen j ouvrés) · Transmis à la DN 30 j                                                                               | counts; `directorWorkingDays`; `returnedAt` (in the rows)                 |
| Finance              | Factures à transmettre (dont _n_ en retard) · Preuves à valider (dont _n_ en retard) · En attente du postulant (dont _n_ nouvelle preuve demandée) · Validés 30 j | counts; urgency; `newProofRequested`; `payment.validatedAt` (in the rows) |
| CI                   | Visites à enregistrer (dont _n_ passées) · Avis à rendre · Paiement en attente, plus the 7-day strip                                                              | counts; urgency; `scheduledAt`                                            |

**Not carried over:**

- the activity feeds, which need an `audit_logs` query (R3);
- the period filter;
- the approval rate and progress bars.

### 10.2 Callout copy per domain

French lives in each domain's `…Copy.ts`; examples:

- **Courriers**
  - `print_for_dg`: « Impression et mise en circuit DG » / « Imprimez le document puis confirmez sa mise en circuit DG. »
  - `record_dg_annotation`: « Annotation du DG attendue » / « En circuit DG depuis n j ouvrés (alerte au-delà de X). Scannez le retour annoté dès réception. »
  - `handed_to_assistant_dn`: « Annotation du DG enregistrée » / « Le dossier est transmis à l'Assistante DN pour le circuit Directeur DN. »
  - `handed_to_dn`: « … transmis à la DN. »
  - `phase_not_open`: « La phase M3/M4 n'est pas ouverte : aucune action du circuit possible. »
- **Circuit Directeur DN**
  - `send_to_director`: « À transmettre au Directeur DN »
  - `record_director_annotation`: « Chez le Directeur DN » / « Téléversez le retour annoté dès réception. »
- **Finance**
  - `send_invoice`: « Facture à transmettre », CTA « Joindre la facture transmise »
  - `await_payment_proof`: « En attente du postulant » / « La facture a été transmise. La preuve de paiement est attendue. » + « Nouvelle preuve de paiement demandée : <motif> »
  - `validate_payment_proof`: « Preuve de paiement à valider »
- **Cellule Inspection**
  - `await_payment`: « Paiement en attente » / « La visite pourra être enregistrée une fois le paiement validé par Finance. » (owner Finance or Postulant)
  - `record_visit_held`: « Visite à enregistrer »
  - `submit_verdict`: « Avis d'inspection à rendre » / « La visite est tenue. L'avis doit être enregistré. »
- **Closed dossier:** « Dossier clos - consultation uniquement ».

### 10.3 Page composition

- **Courriers.** The page keeps its flow (viewer with « Impression OK - mettre en circuit DG », the return modal). It moves onto the primitives and renames per §12.
- **Circuit Directeur DN.** The page moves onto the primitives: `MessageList` (keyboard), sort, « Tous ». « Voir le dossier » appears for DN roles, using the same rule as Courriers.
- **Finance.** `S5PaymentsPage.tsx` (1 194 lines) is split into:
  - `pages/payments/financeQueue.ts` (copy, metrics);
  - `FinancePaymentPane.tsx` (callout, payment documents, timeline);
  - `InvoiceModal` → `CockpitUploadModal`;
  - `RejectModal` (kept, still exported for its test);
  - the page.
    The table and pagination are removed. The « Montant » row, which always showed « - », is removed.
- **CI.** The table is replaced by the two-pane layout. The calendar strip is kept above the list. The detail pane gets the callout; the verdict form and « Enregistrer la tenue » are rendered as the CTA area.

## 11. Dashboard deletions

**Admin.** Delete:

- `pages/dashboard/ReceptionDashboardPage.tsx`, `S5DashboardPage.tsx` and `R3DashboardPage.tsx`;
- `fetchS5DashboardSummary`, `fetchReceptionDashboardSummary` and `fetchR3DashboardSummary` (`lib/api/dashboard.api.ts`);
- every `S5Dashboard*`, `ReceptionDashboard*` and `R3Dashboard*` type (`lib/api/dashboard.types.ts`);
- any `pages/dashboard/components/*` file left unused (`DashboardSection`, `EmptyDashboardState` and `PeriodFilter` are kept if `DashboardPage` uses them).

**API.** Delete:

- `getS5DashboardSummary`, `getReceptionDashboardSummary` and `getR3DashboardSummary`;
- their private helpers: `s5WaitingFrom`, `s5WaitingDays`, `s5Priority`, `receptionWaitingFrom`, the `s5ActivityLabel`/`receptionActivityLabel`/`r3ActivityLabel` functions, and the `S5_*`/`RECEPTION_CIRCUIT_*`/`R3_MISSION_*` label maps (only where `getDashboardSummary` does not use them);
- the `s5Summary`, `receptionSummary` and `r3Summary` controllers;
- the routes `/s5-summary`, `/reception-summary` and `/r3-summary`;
- the matching types.

**DN dashboard.** `getDashboardSummary` and its `loadDashboardSlaConfig` are unchanged, apart from importing the moved defaults.

**Tests to migrate, not drop.**

- `dn-annotation.db.test.ts:308` asserts the Réception dashboard excludes DN-circuit rows. It moves to `GET /api/courrier-tasks`, which must never list a `dn_director_annotation` row.
- `meeting-negotiation.db.test.ts:180` reads the CI dashboard activity to prove MEETING_SCHEDULED is attributed to the assigned agent. It moves to a direct assertion on the `audit_logs` row (`details.dnAgentId`), plus the new SU and assigned `my-queue` scoping.

## 12. Terminology (admin only)

| Old                                                                                                                                                                                | New                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Courriers - circuit signature », « Circuit signature », « Retour signé », « Retours signés », « Scanner le retour signé », « Retour signé scanné », « Retour signé impossible. » | « Courriers - circuit DG », « Circuit DG », « Annotation du DG », « Retours enregistrés », « Scanner le retour annoté », « Retour annoté scanné », « Enregistrement du retour annoté impossible. » |
| Stepper « Déposé / En signature / Retour scanné / Transmis DN »                                                                                                                    | « Déposé / En circuit DG / Annotation reçue / Transmis » (+ « à l'Assistante DN » or « à la DN » in the done step's sub-label)                                                                     |
| Cockpit (`cockpit-next-action.ts`) « Le dossier est dans le circuit de signature du DG… », « Le document de la phase est dans le circuit de signature du DG. »                     | « … dans le circuit DG, en attente de l'annotation du DG… »: a wording-only change in the API cockpit text (D7)                                                                                    |
| Nav « Courrier DN »                                                                                                                                                                | « Circuit Directeur DN »                                                                                                                                                                           |
| « En attente du retour » (DN tab)                                                                                                                                                  | « Chez le Directeur DN »                                                                                                                                                                           |
| Finance: « Facture à envoyer », « Importer la facture transmise », « Joindre facture envoyée », « Facture reçue à transmettre », cockpit « Facture à émettre »                     | « Facture à transmettre », CTA « Joindre la facture transmise » (cockpit aligned)                                                                                                                  |
| Finance: « Preuve », « Preuve postulant », « Quittances retournées », « Preuves attendues »                                                                                        | « Preuve de paiement », « En attente du postulant » (D8)                                                                                                                                           |
| Finance: « Paiements valides », « Valides », « Rejetés », « Paiement traité »                                                                                                      | « Validés », within « Traités »                                                                                                                                                                    |
| CI: « Mes Inspections », « Marquer tenue », « Avis attendu », « Avis à remettre », « Planifiée » / « Prévue »                                                                      | « Mes inspections », « Enregistrer la tenue », « Avis à rendre », « Visite prévue »                                                                                                                |
| Accents: « pieces », « immediate », « Non initialise », « Reprogrammee », « renseigne », « Délai non mesure », « Cette action enregistré »                                         | corrected wherever the touched files keep the text                                                                                                                                                 |

**Kept unchanged:**

- « Retour signé enregistré » on the M7 certificate (a genuinely signed ANAC output);
- DN analytics wording (out of scope);
- the portal wording (§15).

## 13. Performance and query counts

The number of statements per request is pinned by tests (the UX-1 counting harness). No per-row query, and no table read twice per request.

| Endpoint                            | Before                                                                                | After                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/courrier-tasks`           | circuits 1 + phases 1 + requests 1 + documents 1 + alert parameter 1 + holidays 1 = 6 | circuits 1 + phases 1 + requests 1 + documents 1 + parameters 1 (`getIntegerValues`: alert and deposit days) + holidays 1 = **6** |
| `GET /api/dn-annotation-tasks`      | 4                                                                                     | **4**                                                                                                                             |
| Finance queue                       | 3 HTTP calls × 1 query                                                                | **1 HTTP call: 1 query + parameters 1 = 2**                                                                                       |
| `GET /api/site-inspection/my-queue` | 1                                                                                     | **1** (SU or agent)                                                                                                               |
| `PATCH …/site-visits/:id/held`      | dossier check + meeting select + update + audit                                       | same count: the payment comes from the joined meeting select                                                                      |
| Retired dashboards                  | each 2 queries + 11 parameter reads                                                   | deleted                                                                                                                           |

`getIntegerValues(keys)` issues one `SELECT … WHERE key IN (…)`.

## 14. Tests

- **Shared** (`node:test`):
  - `urgencyFromAge` boundaries;
  - `canRecordSiteVisitHeld`;
  - `OPERATIONAL_OWNERS` values equal the route guards (a guard test reading `requireRole` lists, the same style as UX-1).
- **API DB tests**, one per domain:
  - every row of the §5 tables, with bucket, state, owner, actionKey, blockReason and urgency;
  - B1: a closed-dossier or closed-phase row is in `items` with bucket `inactive`, and every action bucket count excludes it. The tests assert the action buckets; they do not require `counts.inactive === 0`;
  - B6 owner keys;
  - Finance: `rejected` lands in `done`, `newProofRequested` is set (B3), and the invoice urgency counts from `phase.openedAt` (B2);
  - CI: SU sees every mission, an agent sees only their own, `assignedToViewer` is correct, and the payment owner follows the payment status;
  - constant query counts (§13), with 1 vs 5 dossiers.
- **B4** (DB and HTTP):
  - two concurrent « held » calls on the same visit give exactly one 200 and one 409 `MEETING_NOT_SCHEDULED`, with a single `SITE_VISIT_HELD` audit row;
  - marking held with the payment `awaiting_invoice`, `awaiting_proof` or `pending_validation` gives 409 `SITE_VISIT_PAYMENT_NOT_VALIDATED`, and the visit stays `scheduled`;
  - with `validated` it succeeds;
  - a non-scheduled visit gives 409 `MEETING_NOT_SCHEDULED` (no longer a 500);
  - an unassigned agent gets 403, and a closed dossier gets 409 `DOSSIER_CLOSED`;
  - scheduling an unpaid visit still succeeds;
  - the verdict guard is unchanged.
- **Removed routes:** the deleted dashboard and per-phase payment-queue routes return 404, and the Finance queue's guard (Finance and SU only) is tested.
- **Admin (vitest):**
  - `homeFor`: the full §9 matrix;
  - `HomeRoute` redirects to the role's queue;
  - the nav item set per role;
  - the primitives: `useUrlSelection` fallback, `sortQueue` order, `AgingBadge`, three distinct loading/error/empty messages in `QueueColumn`.
- **Per page** (Courriers, Circuit Directeur DN, Finance, CI):
  - the callout for each actionKey;
  - no CTA when `canAct` is false, while the secondary link is still present;
  - the closed-dossier read-only state;
  - the default tab (Courriers per role; the other pages fixed);
  - the metrics computed from rows;
  - keyboard selection.
- **Per role:**
  - Courriers: print, DG return, B6 wording;
  - Circuit Directeur DN: « Tous » reaches a closed pending item;
  - Finance: the rejection reason is displayed;
  - CI: SU sees a mission assigned to someone else without a CTA; an unpaid scheduled visit has no « Enregistrer la tenue ».
- **Multi-role:** for each single role and for SU, render the four pages and assert that no mutation button appears for a step whose route guard rejects that role.
- **Existing suites stay green:**
  - `closed-dossier-lists` (admin and API), with the payment-queue keys updated;
  - courrier and DN-annotation route guards;
  - UX-1 cockpit tests, with the label assertions updated for §12.

## 15. Edge cases and residuals

- **A courrier whose phase is not open** is `blocked` with owner DN. The DN sees it through Demandes, not this queue.
- **An SU who is also an `r3_agent`** sees every mission and gets a CTA only on their assigned ones.
- **A CI mission whose payment row is missing** (not expected, since it is created with the phase) → `awaiting_payment` with owner Finance.
- **Portal wording.** The portal still says « circuit de signature » and « retour signé » for the M4 letter (`FormalPhaseSection.tsx`). This contradicts D7, but the portal is out of scope; it is a follow-up.
- **Finance history.** The Finance list is unbounded, as it already is today (§7.3). A server-side history window is the follow-up if volume grows.
- **Activity feeds** are not carried over (R3); the audit trail stays in `audit_logs`.

## 16. Migration and schema

None. No new parameter: only existing keys are read.

## 17. Implementation slices

1. **Foundations.**
   - Shared: `operational-queue.ts` (contract, `urgencyFromAge`, `OPERATIONAL_OWNERS`, `canRecordSiteVisitHeld`); `cockpit-next-action.ts` and admin `owners.ts` switch to `OPERATIONAL_OWNERS`.
   - `getIntegerValues`; the moved SLA defaults.
   - The admin cockpit primitives, extracted from `CourrierTasksPage` with no behaviour change.
   - `homeFor` plus `HomeRoute` and nav.
2. **Courriers.** API read model (§5.1, B6, B1 by construction); the page on the primitives; copy; D7 wording, including the cockpit text; the default tab per role.
3. **Circuit Directeur DN.** API read model (§5.2); the page on the primitives; « Tous »; nav label.
4. **Finance.** The `finance-queue` endpoint; removal of the per-phase queues; the page split and two-pane layout; B2 and B3; D8 wording.
5. **Cellule Inspection.** B4 guard, error mapping and tests; `my-queue` read model with SU scoping (§5.4, §7.4); the two-pane page; B5.
6. **Dashboard deletions** (§11) with the test migrations; docs (decision #20, changelog, `current-task.md`, this spec's status); full validation matrix.

**Delivery.** One feature commit after full validation; no push.

## 18. Resolved defaults

- **Activity feeds are removed** from the role cockpits (ruling): they would need an `audit_logs` query for peripheral history; the history stays in the dossier and `audit_logs`.
- **CI visit urgency** is frozen as in §5.4: after today normal, today « Échéance proche », before today « En retard ».

Nothing remains unresolved.
