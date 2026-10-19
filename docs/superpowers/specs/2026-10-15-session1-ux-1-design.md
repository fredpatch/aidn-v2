# SESSION1-UX-1 - Visibility of documentary actions and next actions

**Status**: design approved (audit report, D1–D11 with amendments); spec approved with two precisions (M4 missing-piece definition, MEET-1 past-meeting rule kept); implemented and validated (2026-10-16)
**Date**: 2026-10-15
**Depends on**: SESSION1-MEET-1 (`2721c0c`), SESSION1-MEET-2 (`658435f`)
**Out of scope**: role-dashboard / cockpit redesigns (Réception, Assistant DG, Assistante DN, Finance, CI dashboards), cockpit metrics, ACCOUNT-1, e-mail / notifications, database migration.

## 1. Problem

1. **Admin**: the next action exists but is easy to miss. « Le dossier attend impression et mise en circuit DG. » is a muted, right-aligned `text-xs` line next to a grey chip (`RequestReadingPane`). Nothing says who must act, nor why the current user has no button. `nextActionTone` mixes urgency with actor. The admin phase helpers name wrong owners (Finance shown as DN, applicant-awaited states shown as DN work).
2. **Portal**: only two applicant actions reach the dashboard (meeting confirmation, signed compte rendu), each through a custom banner. Six other expected actions are only discoverable inside the dossier.
3. **Portal wording**: several texts claim active ANAC work (« en cours de traitement », « analyse », « vérification ») when only a deposit is proven.

Business principle: **if AIDN expects an action from the applicant, it is discoverable from the portal dashboard without knowing which screen holds it.**

## 2. Frozen decisions

| #   | Decision                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | The API is the source of truth for `ApplicantAction[]` (eligibility, ordering, anchor, context).                                                                                   |
| D2  | The portal owns the French wording, keyed by `ApplicantActionKey`. The API sends no French text for actions.                                                                       |
| D3  | Base priority matrix (§5.3) accepted; a real due date may raise urgency (§5.4). `document_correction` is not forced behind `payment_proof` when its deadline makes it more urgent. |
| D4  | M4 supporting documents are actionable as soon as M4 opens (the API already accepts them). No letter-return gate is introduced.                                                    |
| D5  | `certificate_collection` is an applicant action (physical, lowest priority).                                                                                                       |
| D6  | The meeting confirmation action deep-links to the dossier meeting anchor, not `/reunions`.                                                                                         |
| D7  | `MeetingsToConfirmBanner` and `ReportsToSignBanner` are deleted, replaced by one « Actions requises » panel. No adapter phase.                                                     |
| D8  | Admin uses one `OperationalCallout`. The owner model distinguishes the actor kind (§7.2).                                                                                          |
| D9  | The Demandes cockpit's generic open-phase wording (« Poursuivre <phase> ») is improved in UX-1 (§7.4).                                                                             |
| D10 | The portal neutral-wording table (§8) is approved.                                                                                                                                 |
| D11 | The stale payment-rejection presentation is fixed through `status === 'awaiting_proof'`, without migration or data cleanup.                                                        |
| -   | `ApplicantAction[]` holds only actions actually expected from the applicant, never passive waiting states.                                                                         |
| -   | Action predicates are reused by the write services where practical, so visibility and authorization cannot drift (§5.2).                                                           |

## 3. Inventory of applicant write routes

Every applicant write route and its classification (derived from the route guards and service guards on `main` at `658435f`):

| Route                                                                                            | Expected action?         | Key                        |
| ------------------------------------------------------------------------------------------------ | ------------------------ | -------------------------- |
| `POST /requests` (new request)                                                                   | no (applicant-initiated) | -                          |
| `POST /requests/:id/cancel`                                                                      | no (optional)            | -                          |
| `POST /meetings/:id/confirm`, `POST /meetings/:id/propose-alternate`                             | yes                      | `meeting_confirmation`     |
| `POST /meetings/:id/signed-report`                                                               | yes                      | `signed_meeting_report`    |
| `POST /preliminary-evaluation/:phaseId/submit`                                                   | yes                      | `preliminary_declaration`  |
| `POST /formal-request/requests/:requestId/letter`                                                | yes                      | `formal_letter`            |
| `POST /formal-request/requests/:requestId/documents`                                             | yes                      | `formal_missing_documents` |
| `POST /{deep-evaluation,site-inspection,certificates}/phases/:phaseId/requests/:requestId/proof` | yes                      | `payment_proof`            |
| `POST /deep-evaluation/evaluations/:evaluationId/resubmit`                                       | yes                      | `document_correction`      |
| (none - physical, recorded by the DN via `/certificates/:id/collected`)                          | yes                      | `certificate_collection`   |

## 4. Final `ApplicantActionKey` list

```ts
export const APPLICANT_ACTION_KEYS = [
  'meeting_confirmation',
  'signed_meeting_report',
  'preliminary_declaration',
  'formal_letter',
  'formal_missing_documents',
  'payment_proof',
  'document_correction',
  'certificate_collection',
] as const;
export type ApplicantActionKey = (typeof APPLICANT_ACTION_KEYS)[number];
```

Lives in `@aidn/shared` (new `applicant-actions.ts`, exported from the package index) with the base priority table.

## 5. API - `ApplicantAction[]`

### 5.1 Contract

`GET /applicant/actions` - `authenticateApplicant`, no body, no query parameter. Returns the actions of **every** dossier of the authenticated applicant, already ordered (§5.4). The array order is the contract; the portal never re-sorts.

```ts
export interface ApplicantAction {
  /** Dedup identity: `${key}:${requestId}:${subjectId}`. Unique in the response. */
  id: string;
  key: ApplicantActionKey;
  requestId: number;
  requestReference: string;
  phaseCode: 'M3' | 'M4' | 'M5' | 'M6' | 'M7';
  /** Base priority from APPLICANT_ACTION_PRIORITY (lower = first). */
  priority: number;
  /** True when dueAt is overdue or within URGENCY_WINDOW_HOURS (§5.4). */
  urgent: boolean;
  /** Fragment of the dossier page, without '#', e.g. 'compte-rendu-9'. */
  anchor: string;
  /** ISO date the action is due by, or null when the workflow sets none. */
  dueAt: string | null;
  /** formal_missing_documents: missing slots; document_correction: documents to correct. */
  count?: number;
  /** payment_proof only: a previous proof was refused (rejectionReason set). */
  variant?: 'after_rejection';
}
```

`subjectId` per key: meeting id (`meeting_confirmation`, `signed_meeting_report`), preliminary form id, M4 phase id (`formal_letter`, `formal_missing_documents`), payment id, M5 phase id (`document_correction`), certificate id.

Only dossiers that are **not closed** (`isDossierClosed` false) contribute. One action per `id`.

### 5.2 Predicates

The new predicates take plain objects (no Drizzle types) and live in `packages/shared/src/applicant-actions.ts`, so the API services, the API cockpit and the admin phase helpers call the same functions. The MEET-1 / MEET-2 predicates stay in `apps/api/src/modules/meetings/meeting-confirmation.ts` (unchanged). `apps/api/src/modules/applicant-actions/applicant-actions.policy.ts` composes both sets into the per-dossier list.

Two levels, pure functions, no I/O:

- `can…` - **authorization**: what the write service accepts. Used by the service guard where the guard is a pure predicate today.
- `expects…` - **expectation**: what the applicant is _expected_ to do. Always `expects ⇒ can`; a unit test enumerates each key's state space and asserts the implication.

| Key                        | `expects…` (action shown)                                                                                | `can…` (route accepts)                                                                      | Guard reuse                                                                                                                                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `meeting_confirmation`     | `canApplicantRespond(meeting) && !dossierClosed` (MEET-1, exists in `meeting-confirmation.ts`)           | same                                                                                        | already shared (MEET-1)                                                                                                                                                                                                                                                                                                  |
| `signed_meeting_report`    | `canApplicantSubmitSignedReport(meeting, dossierClosed)` (MEET-2)                                        | same                                                                                        | already shared (MEET-2)                                                                                                                                                                                                                                                                                                  |
| `preliminary_declaration`  | `form.madeAvailableAt !== null && form.submittedFileUrl === null && m3.status === 'open'`                | `madeAvailableAt !== null && submittedFileUrl === null`                                     | `submitEvaluation` calls `canApplicantSubmitDeclaration(form)` for its two checks; error codes unchanged (`NOT_YET_AVAILABLE`, `DECLARATION_ALREADY_SUBMITTED`)                                                                                                                                                          |
| `formal_letter`            | `m4.status === 'open' && letterCircuit === null`                                                         | same                                                                                        | `submitFormalLetter` calls `canApplicantSubmitLetter(phase, existing)`; codes unchanged (`PHASE_NOT_OPEN`, `LETTER_ALREADY_SUBMITTED`)                                                                                                                                                                                   |
| `formal_missing_documents` | `m4.status === 'open'` and ≥ 1 row with `isFormalDocumentMissing` (definition below; D4: no letter gate) | slot: `phase.status === 'open' && isFormalDocumentMissing(slot)`                            | `submitDocument` calls `canApplicantSubmitFormalDocument(phase, slot)` (`PHASE_NOT_OPEN`, `DOCUMENT_ALREADY_SUBMITTED`); today it tests `slot.fileUrl`, which is set in the same update as `status = 'submitted'`, so switching to the status is behaviour-equivalent; `closeFormalPhase` gate 2 uses the same predicate |
| `payment_proof`            | `payment.invoiceFileUrl !== null && payment.status === 'awaiting_proof'` (D11)                           | `invoiceFileUrl !== null && status !== 'validated'` (a pending proof may still be replaced) | `attachPaymentProof` calls `canApplicantUploadProof(payment)`; codes unchanged (`INVOICE_NOT_UPLOADED`, `PAYMENT_ALREADY_VALIDATED`)                                                                                                                                                                                     |
| `document_correction`      | M5 open and ≥ 1 evaluation with verdict `rejected` or `needs_correction`                                 | evaluation verdict `rejected` or `needs_correction`                                         | `resubmitDocument` calls `canApplicantResubmit(evaluation)` (`RESUBMISSION_NOT_ALLOWED`)                                                                                                                                                                                                                                 |
| `certificate_collection`   | `certificate.status === 'notified'`                                                                      | - (no applicant route)                                                                      | -                                                                                                                                                                                                                                                                                                                        |

**`formal_missing_documents` - definition of a missing piece.** `missingSlots` counts only the requirements that are currently applicable and still expected from the applicant, **using the same source of truth as the M4 closure gate** - never a separate count of rows without `fileUrl`. On `main` (`658435f`) that policy is:

- `openFormalPhase` pre-creates one `formal_request_documents` row per slot of `SLOT_LABELS` (11 slots, `formal_document_slot` enum), status `missing`;
- `closeFormalPhase` gate 2 refuses closure while any row of the phase has `status === 'missing'` (`DOCUMENTS_INCOMPLETE`);
- there is **no** applicability or optionality notion for M4 pieces: no column, no per-request-type rule, no optional flag (the only optional item of the admin M4 checklist is the meeting compte rendu, which is not a slot). All 11 are mandatory for every dossier.

So UX-1 extracts the gate's test into one shared predicate and uses it in three places:

```ts
// @aidn/shared
/** M4 piece still expected from the applicant: the definition the closure gate (DOCUMENTS_INCOMPLETE) enforces. */
export function isFormalDocumentMissing(doc: { status: 'missing' | 'submitted' }): boolean {
  return doc.status === 'missing';
}
```

1. `closeFormalPhase` gate 2: `docs.filter(isFormalDocumentMissing).length > 0` → `DOCUMENTS_INCOMPLETE` (behaviour unchanged);
2. `expectsFormalDocuments`: `m4.status === 'open' && rows.filter(isFormalDocumentMissing).length > 0`, `count` = that number, over the phase's rows (the same rows the gate reads);
3. the M4 bundle `completionRate` and the admin checklist stay as they are (11 − missing on normal data); a DB test pins `count === 11 − completionRate` and "count 0 ⇔ gate passes".

UX-1 introduces no applicability rule. If M4 later gets optional or conditional pieces, that rule goes into this predicate (and its gate) only; the action, the count and the closure follow automatically.

**`meeting_confirmation` after the meeting time - MEET-1 rule kept.** `scheduled` + `awaiting_applicant` stays an action for as long as `canApplicantRespond` is true, including after `scheduledAt`; it is then overdue, hence `urgent` (§5.4). UX-1 adds no expiry, no hiding and no automatic rescheduling. What should happen to an unanswered past meeting (DN reschedules, automatic expiry, late confirmation allowed) is a separate future business rule.

Rules:

- The guards keep their exact error codes, HTTP mapping and ordering relative to `claimUploadAsset` (idempotent replay first). Only the boolean test moves into the policy module.
- The dossier-open check (K7) stays where it is (`assert…DossierOpen` in the transaction); the read model filters closed dossiers itself.
- `payment.rejectionReason` is **not** cleared and no data is migrated (D11). It only sets `variant: 'after_rejection'` while `status === 'awaiting_proof'`.

### 5.3 Base priority

```ts
export const APPLICANT_ACTION_PRIORITY: Record<ApplicantActionKey, number> = {
  meeting_confirmation: 10, // blocks: an unconfirmed meeting cannot be held (MEETING_NOT_CONFIRMED)
  payment_proof: 20, // blocks: closure needs a validated payment (PAYMENT_NOT_VALIDATED)
  document_correction: 30, // blocks: DOCUMENTS_NOT_ALL_VALIDATED
  formal_letter: 40, // blocks: formal meeting and closure (LETTER_NOT_TRANSMITTED)
  formal_missing_documents: 50, // blocks: DOCUMENTS_INCOMPLETE
  preliminary_declaration: 60, // blocks: M3 closure
  signed_meeting_report: 80, // does not block (closure independent, MEET-2)
  certificate_collection: 90, // physical, final step
};
```

Gaps leave room for later keys. Blocking keys are < 80.

### 5.4 Ordering and deadlines

`dueAt` per key:

| Key                       | `dueAt`                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `meeting_confirmation`    | `meeting.scheduledAt` (the answer is useless after the meeting time)  |
| `preliminary_declaration` | `form.returnDeadline` (nullable)                                      |
| `document_correction`     | earliest non-null `correctionDeadline` among the documents to correct |
| all others                | `null` (no deadline column exists)                                    |

`urgent = dueAt !== null && dueAt <= now + URGENCY_WINDOW_HOURS`, with `URGENCY_WINDOW_HOURS = 72` (constant in `@aidn/shared`; an overdue action is urgent). Calendar hours, not business days: the window only orders the list, it decides nothing.

Sort order (stable, server-side):

1. `urgent` actions first;
2. among urgent actions: `dueAt` ascending, then base priority;
3. among non-urgent actions: base priority ascending, then `dueAt` ascending (nulls last);
4. then `requestReference` ascending, then `id`.

Consequences: a correction due tomorrow outranks a payment proof without deadline (D3 amendment); a meeting in 10 days still precedes a correction due in 3 weeks (base priority); without any deadline the base matrix applies unchanged.

### 5.5 Service and queries (`applicant-actions.service.ts`)

`listApplicantActions(applicantId, now = new Date())`: a fixed number of set-based queries, each filtered by `requests.applicantId` and the open-dossier statuses - never one query per dossier:

1. meetings (M3/M4) with phase and request - the MEET-1/MEET-2 blocks (`applicantBlocksFor` reused);
2. preliminary evaluation forms with M3 phase;
3. M4 phases with letter circuit (`dg_circuit_documents`, `entityType 'formal_request_letter'`) and missing-slot counts (`formal_request_documents`);
4. payments with phase (M5/M6/M7);
5. M5 document evaluations needing correction (count, min deadline);
6. certificates with status `notified`.

Each query is mapped through the §5.2 predicate, then the list is sorted (§5.4). A DB test asserts the query count does not grow with the number of dossiers.

### 5.6 Files

- `apps/api/src/modules/applicant-actions/applicant-actions.policy.ts` (+ `.test.ts`)
- `apps/api/src/modules/applicant-actions/applicant-actions.service.ts` (+ `.db.test.ts`)
- `apps/api/src/modules/applicant-actions/applicant-actions.controller.ts`, `applicant-actions.route.ts` (+ `.http.test.ts`), mounted at `/api/applicant/actions` in the app router.
- Guard reuse: `preliminary-evaluation.service.ts`, `formal-request.service.ts` (`submitFormalLetter`, `submitDocument`, `closeFormalPhase` gate 2), `payments/payment-documents.ts`, `deep-evaluation.service.ts`.
- `packages/shared/src/applicant-actions.ts` (keys, priority, `URGENCY_WINDOW_HOURS`, `ApplicantAction` type, the pure `can…` / `expects…` predicates of §5.2, `NextActionOwner`) + `applicant-actions.test.ts`.

## 6. Portal

### 6.1 Data

- `lib/api/actions.api.ts`: `fetchApplicantActions()` → `GET /applicant/actions`.
- `queryKeys.requests.actions()` = `['requests', 'actions']`. Under the `requests` prefix, so every existing `invalidateQueries({ queryKey: queryKeys.requests.all() })` after an applicant mutation refreshes it. The meeting mutations (MEET-1 confirm / propose, MEET-2 signed report) also invalidate `requests.all()` - verified in the plan, added where missing.
- `hooks/useApplicantActions.ts`: one query shared by the dashboard and the dossier (cache).

### 6.2 Copy (`lib/actions/copy.ts`)

`ACTION_COPY: Record<ApplicantActionKey, (a: ApplicantAction) => { title; description; cta }>`:

| Key                                 | Title                       | Description                                                                      | CTA                  |
| ----------------------------------- | --------------------------- | -------------------------------------------------------------------------------- | -------------------- |
| `meeting_confirmation`              | Rendez-vous à confirmer     | La DN vous propose un rendez-vous. Confirmez-le ou proposez une autre date.      | Répondre             |
| `signed_meeting_report`             | Compte rendu à signer       | Un compte rendu de réunion est disponible et doit être retourné signé.           | Voir le dossier      |
| `preliminary_declaration`           | Déclaration à déposer       | Téléchargez le formulaire, remplissez-le, puis déposez votre déclaration.        | Déposer              |
| `formal_letter`                     | Lettre officielle à déposer | Déposez votre lettre officielle de demande d'agrément OMA.                       | Déposer              |
| `formal_missing_documents`          | Pièces à compléter          | Déposez les pièces manquantes du dossier formel ({count} manquante(s)).          | Déposer              |
| `payment_proof`                     | Quittance à déposer         | Téléchargez la facture puis déposez votre quittance de paiement.                 | Déposer              |
| `payment_proof` + `after_rejection` | Nouvelle quittance requise  | Votre précédente quittance n'a pas été acceptée. Déposez une nouvelle quittance. | Déposer              |
| `document_correction`               | Document à corriger         | {count} document(s) de votre dossier doivent être corrigés.                      | Voir les corrections |
| `certificate_collection`            | Certificat à retirer        | Votre certificat est prêt. Présentez-vous aux bureaux de l'ANAC pour le retirer. | Voir le dossier      |

The rejection reason itself stays in the dossier (`PaymentBlock`), not in the dashboard row. When `dueAt` is set the row adds « À traiter avant le {date} » (`meeting_confirmation`: « Rendez-vous le {date} »); `urgent` adds a warning style, no extra wording.

The MEET-2 phase wording (« Action requise - Compte rendu à signer » / « Le compte rendu de votre réunion est disponible… ») stays for the phase summary and dossier banner; the table above is the dashboard and generic wording. Each key has a `phaseTitle` / `phaseDescription` pair equal to the existing phase wording where one exists, so the dossier keeps today's texts.

### 6.3 Selectors (`lib/actions/selectors.ts`, pure)

- `actionHref(a)` → `{ pathname: '/dossiers/' + a.requestId, hash: '#' + a.anchor }`.
- `dossierActions(all, requestId)` → filtered, server order kept.
- `topDossierAction(all, requestId)` → first of `dossierActions`.
- `topPhaseAction(all, requestId, phaseCode)` → first matching phase.

No sorting, no eligibility logic in the portal.

### 6.4 Anchors

| Key                        | Anchor                     | Element                                                |
| -------------------------- | -------------------------- | ------------------------------------------------------ |
| `meeting_confirmation`     | `rendez-vous-{meetingId}`  | `MeetingConfirmationPanel` region in the M3/M4 section |
| `signed_meeting_report`    | `compte-rendu-{meetingId}` | `MeetingReportPanel` (exists)                          |
| `preliminary_declaration`  | `declaration`              | declaration block, M3                                  |
| `formal_letter`            | `lettre`                   | letter block, M4                                       |
| `formal_missing_documents` | `pieces`                   | « Pièces du dossier formel » card                      |
| `payment_proof`            | `paiement-{phaseCode}`     | `PaymentBlock` of that phase                           |
| `document_correction`      | `corrections`              | M5 corrections card                                    |
| `certificate_collection`   | `retrait`                  | M7 certificate block                                   |

Anchor helpers live next to their component (pattern `meetingReportAnchor`). Each anchored region scrolls itself into view when the hash matches on mount (the MEET-2 `useEffect` pattern, extracted to `useHashScroll(anchor)`). The API builds the same strings; a portal test pins each format.

### 6.5 Dashboard

`components/actions/ApplicantActionsPanel.tsx` replaces `MeetingsToConfirmBanner` and `ReportsToSignBanner` (both files and their tests deleted; the cases move to the panel's tests):

- `section aria-label="Actions requises"`, heading « Actions requises ({n}) »; hidden when the list is empty or still loading; a load error shows a one-line retry inside the section (no silent disappearance).
- One row per action, in server order: title, description, « Dossier {reference} », due line, CTA link to `actionHref`.
- Several dossiers are listed flat; no grouping and no merging.
- In-app only. `NextMeetingCard` (informational) and the `/reunions` page are unchanged.

### 6.6 Dossier and phases

Relationship:

```
Dashboard        → all actions (server order)
ActionBanner     → topDossierAction(requestId), else the open phase's passive wording
Phase summary    → topPhaseAction(requestId, phase), else the builder's passive wording
```

- `build*Presentation(bundle)` become **passive-only**: every `tone: 'warning'` "Action requise" branch that mirrors an action key is removed, together with the MEET-2 `signedReportPresentation` precedence inside the builders. They describe state only (§8 wording).
- `PhaseSummaryCard` receives `action?: ApplicantAction` and renders it over the passive presentation: action title, description, CTA link to the anchor (same-page hash).
- `buildBanner(request, items, actions)`: terminal outcome first (unchanged), then `topDossierAction`, then the open phase's passive presentation, then the existing closed-phase / intake fallbacks. The `tone === 'warning'` inference is deleted; `BannerContent.kind === 'action'` iff an action is shown.
- A closed dossier gets no actions from the API; the read-only rules (`ReadOnlyProvider`) are unchanged.
- `ClosedPhaseRow defaultOpen` is generalized: open when `topPhaseAction` exists for that phase (today only `signed_meeting_report` can target a closed phase - the MEET-2 exception, unchanged).
- `PreliminaryPhaseSection` / `FormalPhaseSection` keep rendering `MeetingConfirmationPanel` and `MeetingReportPanel`; only the summary logic changes.

### 6.7 Portal files

New: `lib/api/actions.api.ts`, `hooks/useApplicantActions.ts`, `lib/actions/copy.ts`, `lib/actions/selectors.ts`, `lib/useHashScroll.ts`, `components/actions/ApplicantActionsPanel.tsx`.
Modified: `DashboardPage.tsx`, `pages/requests/progress.ts`, `DossierView.tsx`, `PreliminaryPhaseSection.tsx`, `FormalPhaseSection.tsx`, `DeepEvaluationSection.tsx`, `SiteInspectionSection.tsx`, `CertificatesSection.tsx`, `PhaseSummaryCard.tsx`, `ActionBanner.tsx`, `ClosedPhaseRow.tsx`, `PaymentBlock.tsx`, `MeetingConfirmationPanel.tsx`, `MeetingReportPanel.tsx`, `lib/react-query/queryKeys.ts`, `lib/api/requests.types.ts`.
Deleted: `MeetingsToConfirmBanner.tsx`, `ReportsToSignBanner.tsx`.

## 7. Admin

### 7.1 `OperationalCallout` (`components/common/OperationalCallout.tsx`)

```ts
type OperationalState = 'action_required' | 'waiting' | 'information' | 'done' | 'blocked';

interface OperationalCalloutProps {
  state: OperationalState;
  title: string;
  description: string;
  owner?: NextActionOwner;            // §7.2; absent for done / information
  cta?: { label: string; href?: string; onClick?: () => void; disabled?: boolean; ref?: Ref<…> };
  blockReason?: string | null;
  compact?: boolean;                  // rail variant
}
```

Rendering:

| state                         | Eyebrow                           | Visual                                                                                  |
| ----------------------------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| `action_required` + `canAct`  | « Action requise »                | warning border and background, icon, CTA inside the callout                             |
| `action_required` + `!canAct` | « En attente de : {owner.label} » | warning border, no CTA; line « Aucune action de votre part : {owner.label} doit agir. » |
| `waiting`                     | « En attente de : {owner.label} » | info border, no CTA                                                                     |
| `information`                 | « Information »                   | neutral                                                                                 |
| `done`                        | « Terminé »                       | success                                                                                 |
| `blocked`                     | « Bloqué »                        | danger; shows `blockReason`                                                             |

- Title `text-sm font-semibold`, description `text-sm` (not muted, not `text-xs`), `role="status"`. The owner is always a visible line « Responsable : {owner.label} », never only a badge.
- A CTA is rendered **only** when `canAct` (§7.3) - never a disabled button for another role's work.
- `PhaseWorkflowSummary.tsx` and `FormalPhaseSummaryCard.tsx` (dead code, not rendered anywhere) are deleted.

### 7.2 Owner model

```ts
// @aidn/shared
export interface NextActionOwner {
  kind: 'staff' | 'applicant' | 'external';
  label: string; // « Réception », « Postulant », « Directeur DN (circuit papier) »…
  roles?: InternalRole[]; // staff only: exactly the roles of the route that performs the action
}
```

- `staff`: `roles` copies the `requireRole(...)` list of the write route, `SU` included when the route allows it. Examples: Réception print → `['assistant_dg', 'reception', 'SU']`; DN phase work → `['dn_agent', 'dn_supervisor', 'SU']`; Finance → `['s5_agent', 'SU']`; CI verdict → `['r3_agent', 'SU']`; Directeur DN return → `['assistant_dn', 'SU']`.
- `applicant`: no roles; label « Postulant ».
- `external`: a person outside the application (the Directeur DN signing on paper); no roles. When the system step after the external actor belongs to staff (recording the annotated return), the owner is that **staff** step instead, with the external actor in the description.

Labels come from `INTERNAL_ROLE_GROUP_LABELS` / `INTERNAL_ROLE_LABELS` where they exist.

### 7.3 `canAct`

```ts
export function canAct(
  owner: NextActionOwner | undefined,
  userRoles: readonly InternalRole[]
): boolean {
  return owner?.kind === 'staff' && (owner.roles ?? []).some((role) => userRoles.includes(role));
}
```

Pure function in `apps/admin/src/lib/next-action-owner.ts`, fed by `useAuth().user.roles`. `applicant` and `external` owners are never actionable by staff. It is a display decision mirroring the route guard (the API still enforces it); no new business rule.

Staff fallbacks that already exist stay where they are: e.g. the DN's « Confirmer pour le postulant » (`/meetings/:id/confirm-on-behalf`) remains in the meeting card; the callout for that state shows owner `applicant` and no CTA.

### 7.4 Demandes cockpit read model

`RequestCockpitItem` gains:

```ts
nextActionState: OperationalState;
nextActionOwner: NextActionOwner | null; // null for terminal dossiers
```

`nextActionLabel`, `nextActionDescription`, `nextActionHref`, `nextActionTone`, `canStartPreliminary` stay (compatibility; tone still colours the list line).

Pre-phase branches (wording refined, owner explicit):

| Condition                         | Label                                | Description                                                                                          | State           | Owner                                                  |
| --------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------ |
| `completed`                       | Workflow terminé                     | (unchanged)                                                                                          | done            | null                                                   |
| `rejected` / `cancelled`          | Dossier rejeté / annulé              | (unchanged)                                                                                          | done            | null                                                   |
| intake `submitted`                | Impression et mise en circuit DG     | Le dossier attend impression et mise en circuit DG.                                                  | action_required | staff Réception `['assistant_dg','reception','SU']`    |
| intake `in_signature_circuit`     | Annotation du DG attendue            | Le dossier est dans le circuit de signature du DG. La DN le suit en lecture seule.                   | waiting         | staff Assistant DG `['assistant_dg','reception','SU']` |
| DN circuit not yet sent           | À transmettre au Directeur DN        | Annotation du DG reçue. L'Assistante DN doit transmettre le dossier au Directeur DN.                 | action_required | staff Assistante DN `['assistant_dn','SU']`            |
| DN circuit `in_signature_circuit` | En attente du retour du Directeur DN | Le dossier est chez le Directeur DN (circuit papier). L'Assistante DN enregistrera le retour annoté. | waiting         | staff Assistante DN `['assistant_dn','SU']`            |
| preliminary openable              | Ouvrir la phase préliminaire         | (unchanged)                                                                                          | action_required | staff DN                                               |

Open-phase branch (D9) - replaces « Poursuivre <phase> » / « Continuer le traitement depuis la phase ouverte. ». First match, per open phase:

0. **DN work pending in parallel** (the DN must never read « en attente » while it has something to do): a meeting counter-proposal `awaiting_dn` → « Contre-proposition à traiter »; M5 documents submitted or resubmitted without a verdict → « Évaluer {n} document(s) ». State `action_required`, owner staff DN `['dn_agent','dn_supervisor','SU']`.
1. **Applicant expected**: any §5.2 `expects…` predicate true for this dossier and phase (the **same** policy functions, fed by the cockpit's batch rows) → label « En attente du postulant », description from a per-key staff wording (e.g. « Quittance de paiement attendue du postulant (M5). », « Confirmation du rendez-vous attendue du postulant. », « {n} pièce(s) attendue(s) du postulant. »), state `waiting`, owner `applicant`.
2. **Finance**: payment without invoice, or payment `pending_validation` → « Facture à émettre » / « Quittance à valider », state `action_required`, owner staff Finance `['s5_agent','SU']`.
3. **Cellule Inspection**: M6 visit held, no verdict → « Avis d'inspection attendu », `action_required`, owner staff CI `['r3_agent','SU']`.
4. **DG circuits inside a phase**: M4 letter or M3 declaration circuit `submitted` → Réception print (`action_required`); `in_signature_circuit` / `signed` → Assistant DG (`waiting`), roles of `/letter/mark-signed` / `/mark-pending-review` (`['reception','assistant_dg','SU']`).
5. **Otherwise**: « Traiter {phase label} » / « La DN poursuit le traitement de la phase ouverte. », `action_required`, owner staff DN.

`signed_meeting_report` is never a cockpit "waiting" reason: it does not block (MEET-2). The cockpit already loads every table in one batch; it adds the batch reads of payments, meetings, preliminary forms, letter / declaration circuits and certificates (one query each, no N+1).

Last-closed branch: « Ouvrir la phase suivante » unchanged, owner staff DN. Fallback « À vérifier », owner staff DN, state `information`.

### 7.5 Rendering

- `RequestReadingPane`: the action bar keeps the CTA buttons (`start`, `treat`, `consult` unchanged), and the right-aligned description paragraph and the grey `readonly` chip are replaced by an `OperationalCallout` directly under the header (`state`, `owner`, label, description; CTA = the existing button when `canAct`, else none).
- `RequestsList`: the row line becomes « {phase} - {label} » plus the owner label when the owner is not the current user's role (« · Réception »). Colour stays tone-driven.
- `WorkflowCockpit` rail: « Prochaine action requise » section becomes `OperationalCallout compact`; `primaryAction` becomes its CTA (only when `canAct`). The same callout (non-compact) is also rendered at the top of the main column so it stays near the workflow area below `xl`.

### 7.6 Admin phase helpers

`phases/*/helpers.ts` keep computing the phase rail state (finer than the cockpit; phase-page redesign is not in scope) but return `{ state, owner: NextActionOwner, … }` instead of `tone` + free-string owner, with these fixes:

| Helper                                  | Fix                                                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M3 / M4 meeting `scheduled`             | `awaiting_applicant` → « Confirmation du rendez-vous attendue », owner applicant, waiting; `awaiting_dn` → « Contre-proposition à traiter », owner DN, action_required; confirmed → « Réunion … à résoudre » (unchanged) |
| M3 declaration circuit                  | split: `submitted` → « Impression et mise en circuit DG de la déclaration », owner Réception; `in_signature_circuit` / `signed` → « Circuit DG en cours », owner Assistant DG, waiting                                   |
| M3 `blockReason`                        | meeting unresolved → (unchanged); declaration missing → (unchanged); declaration returned, circuit pending → « La clôture sera disponible au retour du circuit DG de la déclaration. »                                   |
| M4 « Documents obligatoires manquants » | owner applicant, waiting (« Pièces attendues du postulant »)                                                                                                                                                             |
| M5 / M6 « Facture à envoyer »           | owner Finance `['s5_agent','SU']`                                                                                                                                                                                        |
| M5 / M6 / M7 « Paiement à valider »     | split: `awaiting_proof` → « Quittance attendue du postulant », owner applicant, waiting; `pending_validation` → « Paiement à valider », owner Finance                                                                    |
| M3 / M4 metrics « Compte-rendu »        | `signed copy awaited` shows « Signé attendu » (informational; no state change)                                                                                                                                           |
| accents                                 | « à résoudre », « à clôturer », « Certificat à créer », « Document à générer », « Retour signé à enregistrer », « Archivage à effectuer », « Postulant à notifier », « Retrait à enregistrer »                           |

Where an admin helper tests an applicant expectation (proof awaited, pieces missing, declaration awaited), it calls the `@aidn/shared` `expects…` predicate on bundle fields instead of re-coding the test (§10).

### 7.7 Admin files

New: `components/common/OperationalCallout.tsx` (+ test), `lib/next-action-owner.ts` (+ test).
Modified: `pages/requests/RequestReadingPane.tsx`, `pages/requests/RequestsList.tsx`, `lib/api/requests.types.ts`, `pages/phases/components/WorkflowCockpit.tsx`, the five `phases/*/helpers.ts` and their pages (`PreliminaryPhasePage`, `FormalPhasePage`, `DeepEvaluationPhasePage`, `SiteInspectionPhasePage`, `CertificatesPhasePage`).
Deleted: `pages/phases/components/PhaseWorkflowSummary.tsx`, `pages/phases/formal/components/FormalPhaseSummaryCard.tsx`.
API: `requests.service.ts` (`nextAction`, batch reads), `requests.types.ts`.

## 8. Portal wording (approved, D10)

Rule: never write « en cours de traitement », « en cours d'analyse », « l'ANAC analyse », « traitement ANAC en cours », « en cours de vérification » because a document was uploaded or received. Active-processing wording only for a state that proves it (e.g. dossier `in_progress`: the DN opened M3).

| Location                                                       | Current                                                                                     | New                                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PreliminaryPhaseSection` declaration submitted                | Formulaire transmis / Votre déclaration est en cours de traitement par l'ANAC.              | **Déclaration transmise** / Votre déclaration a bien été transmise. Vous serez informé dès qu'une nouvelle étape ou une action de votre part sera nécessaire.   |
| `PreliminaryPhaseSection` step « Suite du dossier »            | Traitement ANAC en cours                                                                    | Prochaine étape à venir                                                                                                                                         |
| `PreliminaryPhaseSection` meeting held, form not yet available | L'ANAC prépare le formulaire de pré-évaluation à vous transmettre.                          | Le formulaire de pré-évaluation vous sera transmis ici.                                                                                                         |
| `FormalPhaseSection` letter in circuit                         | Courrier en traitement / Votre lettre suit le circuit de signature…                         | **Lettre transmise** / Votre lettre a bien été transmise et suivra le circuit de signature de l'ANAC. La réunion formelle sera planifiée après le retour signé. |
| `FormalPhaseSection` pieces complete, no meeting               | Traitement ANAC en cours / La DN poursuit la vérification du dossier…                       | **Pièces déposées** / Votre dossier formel est complet. La DN vous proposera une date de réunion formelle.                                                      |
| `DeepEvaluationSection` default                                | L'ANAC analyse les pièces techniques de votre dossier.                                      | Les pièces de votre dossier sont soumises à l'évaluation de la DN.                                                                                              |
| `DeepEvaluationSection` step « Suite du dossier »              | Traitement ANAC en cours                                                                    | Prochaine étape à venir                                                                                                                                         |
| `DeepEvaluationSection` evaluation card                        | L'ANAC analyse les documents soumis. Les corrections éventuelles apparaîtront ici.          | Les documents soumis seront évalués par la DN. Les corrections éventuelles apparaîtront ici.                                                                    |
| M5 / M6 / M7 `pending_validation`                              | Quittance en validation / Votre preuve de paiement est en cours de vérification par l'ANAC. | **Quittance transmise** / Votre quittance a bien été transmise. Elle sera validée par le service Finance.                                                       |
| M5 / M6 invoice awaited                                        | En attente de la facture de la DN.                                                          | En attente de la facture du service Finance.                                                                                                                    |
| `progress.ts` waiting eyebrow                                  | En attente de l'ANAC                                                                        | Aucune action requise de votre part                                                                                                                             |
| `progress.ts` last closed phase                                | L'ANAC prépare l'ouverture de l'étape suivante de votre dossier.                            | La prochaine étape de votre dossier sera ouverte par la DN.                                                                                                     |

Kept (state proven): dossier `in_progress` « En cours de traitement », intake banners, « La DN examinera votre proposition », « Quittance soumise, en attente de validation. », M7 « La DN prépare le certificat » (a certificate row exists).

D11 in the builders: the M5 / M6 / M7 branches test `payment.status === 'awaiting_proof'` (with `rejectionReason` only choosing the wording), so a validated payment with an old `rejectionReason` reads « Paiement validé » state, never « Nouvelle quittance requise ».

## 9. Edge cases

| Case                                              | Behaviour                                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Closed dossier (completed / rejected / cancelled) | No action from the API; dossier read-only, unchanged                                                                        |
| M3 closed, signed compte rendu awaited            | `signed_meeting_report` listed; closed row opens; upload allowed (MEET-2 exception)                                         |
| Meeting awaiting confirmation whose time is past  | Still listed while `canApplicantRespond` is true (MEET-1 rule kept, no expiry introduced), `urgent` (overdue)               |
| M4 slot uploaded                                  | Leaves the count at once; count 0 ⇔ the closure gate passes for documents                                                   |
| Payment validated after a rejection               | No `payment_proof`; passive « Paiement validé »                                                                             |
| Payment `pending_validation` (replaceable)        | No action (`can` true, `expects` false)                                                                                     |
| M4 open, letter in circuit, pieces missing        | `formal_missing_documents` listed (D4)                                                                                      |
| Same key on two dossiers                          | Two rows, two links                                                                                                         |
| API error on `/applicant/actions`                 | Dashboard: retry line; dossier: banner and summaries fall back to passive wording, sections still render their own controls |
| Mutation done                                     | `requests.all()` invalidation refetches actions; the row disappears                                                         |

## 10. Residual duplication (accepted)

- The **admin phase helpers** stay React-side (finer than the cockpit; moving the phase rail server-side is not in scope). Their applicant-expectation tests call the `@aidn/shared` predicates; the staff-side branches (Finance, CI, circuits, DN) remain coded in both the helpers and the cockpit `nextAction`. Their tests pin the owner and state per branch.
- The MEET-1 `awaiting_applicant` test in the admin helpers reads `confirmationStatus` (the admin bundle has no applicant `actions[]`); it matches `canApplicantRespond` for an open dossier.
- The **portal passive builders** still read bundles for passive wording only; they no longer decide any action.

## 11. Migration and schema

None. No new column, enum or system parameter (`URGENCY_WINDOW_HOURS` is a code constant). No backfill; `payments.rejection_reason` is left as is (D11).

## 12. Tests

API:

- `applicant-actions.policy.test.ts`: each predicate; `expects ⇒ can` over each key's state space; ordering (urgent first, `dueAt`, base, reference, id); `URGENCY_WINDOW_HOURS` boundary.
- `applicant-actions.db.test.ts` (disposable test DB): per key appears when eligible / disappears when resolved; closed dossier → none; MEET-2 closed-phase case listed; payment validated after rejection → none; `pending_validation` → none; M4 pieces with the letter in circuit → listed; `formal_missing_documents.count === 11 − completionRate` and count 0 ⇔ gate 2 passes (`DOCUMENTS_INCOMPLETE` not thrown); unanswered meeting with `scheduledAt` in the past → listed and `urgent`; another applicant's dossiers never listed; ids unique; query count constant with 1 vs 3 dossiers.
- `applicant-actions.http.test.ts`: 401 without cookie; 200 shape.
- Guard reuse: existing service tests stay green (same error codes); one test per migrated guard.
- `requests-cockpit.db.test.ts`: owner / state per pre-phase branch; open-phase DN-parallel (step 0) / applicant / Finance / CI / circuit / DN branches, including "DN verdicts pending while corrections are awaited" → DN, not « En attente du postulant »; `signed_meeting_report` never a waiting reason.

Portal:

- selectors (pure): filtering, server order kept, top dossier / phase action.
- `ApplicantActionsPanel`: empty → hidden; single; several dossiers; due / urgent line; `after_rejection` wording; links `/dossiers/:id#anchor`; disappears after a mutation refetch; error retry.
- Dossier: banner = top action; passive wording only without action; closed dossier no action; closed M3 with signed report opens; anchor-exists test - for each key, rendering the dossier with that action puts an element with `id=anchor` containing an enabled control (except `certificate_collection`: the block exists).
- Wording: §8 texts after upload-only states; D11 (validated + old `rejectionReason`).
- MEET-1 / MEET-2 panels unchanged (existing tests stay green).

Admin:

- `OperationalCallout`: each state; `canAct` → CTA inside; `!canAct` → « En attente de : X », no CTA, no disabled button.
- `canAct`: staff role match, SU, applicant / external never.
- Reading pane, DN user, intake `submitted` → callout « En attente de : Réception », no CTA. The Demandes cockpit is DN-only (`requireRole('dn_agent','dn_supervisor','SU')`); its CTAs stay `start` / `treat` / `consult`, shown inside the callout only when `canAct`.
- An SU user on an intake `submitted` dossier: `canAct` is true (SU is in the route roles) but the pane has no print CTA (that workflow lives in the Réception cockpit, unchanged); the callout then shows the owner line and no CTA. `canAct` only _allows_ a CTA, it never invents one.
- Phase helpers: each fixed branch (§7.6).

## 13. Slices

1. API `applicant-actions` (shared types, policy, service, route, guard reuse, D11 predicate) + tests.
2. Portal dashboard: query, copy, selectors, `ApplicantActionsPanel`, delete both banners.
3. Portal dossier / phases: passive builders, banner and summary from selectors, anchors + `useHashScroll`, `ClosedPhaseRow` generalization, §8 wording, D11 in builders.
4. Admin: `OperationalCallout`, `canAct`, cockpit read model (`nextActionState`, `nextActionOwner`, D9), reading pane / list / rail, phase helpers (§7.6), dead components removed.
5. Docs (decisions, changelog, database-schema untouched, current-task), full validation matrix, one commit, no push.

## 14. Left for SESSION1-COCKPIT-1

- Réception, Assistant DG, Assistante DN, Finance (S5), CI (R3) dashboards and their own `nextAction` strings; `CourriersList`, `S5PaymentsPage`, `MyInspectionsPage` labels.
- Cockpit metrics (e.g. counts waiting on the applicant).
- Moving the admin phase rail state server-side.
- Reusing `OperationalCallout` / `NextActionOwner` on those screens.
