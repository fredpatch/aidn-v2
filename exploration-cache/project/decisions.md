# 🎯 AIDN v2 - Key Decisions & Rationale

Non-obvious decisions that would otherwise get re-litigated or silently reversed by
a future session. Business-rule decisions (the 13 modules) live in
`project/modules-feasibility.md` - this file is technical/architectural decisions
made _during implementation_, not during the feasibility study.

## 1. PostgreSQL over MongoDB

Locked before Sprint 0 scaffolding. The 13 modules' business rules are relational
integrity problems (one active demande, 11/11 document checklist, certificate
created at payment validation) - better enforced by SQL constraints than app code.
Logged in Notion (Idées & Pistes, Architecture, 2026-07-07).

## 2. Code in English, UI in French

Deliberate divergence from SICOT (which mixes French/English in server code).
AIDN's code - variables, functions, components, comments, endpoints, error codes -
is entirely English. Only what the user sees is French. Documented explicitly in
`technical/conventions.md`'s "Écarts assumés" section.

## 3. Demande reference format: `DEM-YYYY-MM-DD-ORGCODE-NN`

No global incrementing counter - deliberately avoided to sidestep any reset-policy
complexity. `ORGCODE` is the first 4 alphanumeric characters of the organisation's
normalized name, uppercased. `NN` disambiguates the rare case of the same
organisation submitting more than once on the same calendar day (e.g. a rejection
releases the "one active request" rule same-day). Certificates keep the simpler
`CERT-YYYY-XXXX` format (lower volume, no same-day-collision concern).

## 4. "One active demande" enforced at the database level

A partial unique index (`requests_one_active_per_organisation_idx`), not just an
application check. This closes the exact loophole Fred caught during the M1
feasibility study - cancelling by creating a second demande - permanently, since a
bug in application code can no longer bypass it.

## 5. Dual auth systems, one API server

Staff (`users`) and applicants (`applicants`) are structurally different accounts
with different login flows (OTP vs plain password) and different JWT payload
shapes. A `kind: "staff" | "applicant"` field on every token prevents either being
misused as the other. This was a real gap found mid-Sprint-1: the first version of
the requests module was "tested" using a staff SU token standing in for an
applicant, because applicant auth simply didn't exist yet.

## 6. SMTP env var names match SICOT's exactly

`SMTP_HOST/PORT/USER/PASS/FROM` - chosen specifically so Fred's existing SICOT SMTP
credentials can be copied into AIDN's `.env` with zero renaming.

## 7. `db:migrate` calls a custom script, not the `drizzle-kit` CLI directly

See `technical/gotchas.md` #3 for the full story - `drizzle-kit@0.31.10`'s CLI
silently swallows real Postgres errors on migration failure. `apps/api/src/scripts/
migrate.ts` calls `drizzle-orm`'s `migrate()` function programmatically instead,
which surfaces the real error. This is how two genuine Postgres errors (enum
transaction issue, missing `public` schema) got diagnosed instead of staying
invisible.

## 8. UI/UX must structurally match SICOT, not just share color tokens

Early in the AIDN rebuild, "match SICOT's style" was interpreted as reusing its
ANAC color tokens (`--color-anac-navy` etc.) plus generic clean Tailwind forms.
That was an incomplete read of the actual instruction. SICOT's real Bootstrap/
Login/Layout pages use `react-hook-form` + `zod`, `framer-motion` animations,
shadcn-style hand-written primitives (`Button`/`Input`/`Label`), a password-strength
meter, and a collapsible sidebar nav. AIDN's admin and portal apps were rebuilt to
match this structurally, not just palette-wise, once the gap was flagged.

## 9. Users management page added, not originally scoped

Once the Layout/sidebar was being rebuilt to match SICOT, the nav needed a second
real entry beyond "Demandes." The multi-role system (Sprint 1's `user_roles` join
table + full CRUD API) had no UI at all - there was no way to create a
`dn_agent`/`reception` account except via curl. A minimal SU-only Users page
(list, create with multi-role selection, activate/deactivate, reset OTP) was added
to close that gap, since the backend already existed and was tested.

## 10. Axios client hardened with a proper refresh queue (admin + portal)

The original `lib/api.ts` (both admin and portal) used a single shared `refreshing`
promise to de-dupe concurrent 401-triggered refresh calls - functionally OK for one
in-flight request, but any request that arrived _while_ a refresh was already running
would still race it instead of being queued behind it cleanly. `lib/axios.ts` (now in
both `apps/admin/src/lib/` and `apps/portal/src/lib/`) replaces this with an explicit
`isRefreshing` flag + a `failedQueue` array: every request that 401s while a refresh
is already in flight is queued and replayed only after that single refresh resolves,
rather than each one kicking off its own check. It also skips the refresh dance
entirely for `/auth/*` (admin) or `/applicant-auth/*` (portal) requests (avoids
refreshing in response to a failed login itself) and redirects to `/login` with a
`session_expired` flag on final failure.
**Finished 2026-07-08**: `apps/portal/src/lib/axios.ts` was created mirroring the
admin version, pointed at `/applicant-auth/refresh`; `useApplicantAuth.tsx` switched
over to it; both now-orphaned `lib/api.ts` files deleted. See `technical/gotchas.md`
#11 and #14, `active-session/blockers.md` resolved-blockers table.

## 11. `document_templates` generalized beyond M3's immediate need, on request

M3 only strictly needs one blank template (the déclaration de pré-évaluation), but
M4's DN-AIR-R2-3-F-E-010/011/012 forms have the identical shape (DN uploads/replaces
a blank form by key, either auth type downloads it, history via the M8 version/trash
pattern). Confirmed with Fred to build the table and module generically now -
`document_templates` keyed by `documentTemplateKeyEnum` - with all 4 keys seeded,
rather than building a one-off M3 feature and repeating the same pattern for M4 next
sprint. Only the M3 key (`preliminary_evaluation_declaration`) has real UI/endpoint
usage yet; the M4 keys are schema-ready for Sprint 3.

## 12. Meeting tickets are server-rendered HTML, not generated PDFs

A real PDF generator is a cross-cutting need - M3, M4, and M6 all want a
downloadable/printable ticket or document. Confirmed with Fred that building it once
properly (later, once the shape of that need is clearer across all three modules)
beats building three throwaway one-off PDF generators now. Sprint 2's meeting ticket
is served as plain HTML at `GET /api/meetings/:id/ticket` - not a stored file, not
a PDF - good enough to view/print from a browser, revisit once M4 or M6 need
something the HTML approach can't do.

## 13. `authenticateEither` prefers the cookie matching request `Origin`

See `technical/gotchas.md` #19 for the full incident. Because admin and portal share
a top-level domain, a browser could legitimately carry both a staff and an applicant
session cookie at once; `authenticateEither` used to always try the staff cookie
first, which could let a stale staff session silently win over a genuine applicant
request. Now it reads `Origin` and checks the matching cookie (staff vs. applicant)
first, falling back to the other only if that one's absent or invalid - with the
old staff-first behavior preserved as a fallback for requests with no recognizable
`Origin` (curl, server-to-server, Postman).

## 14. DG circuit documents get their own physical file copy, never a shared `upload_assets` row

Found during PRELIM-DG-CIRCUIT-1: M3's applicant declaration could close the phase
without ever going through the mandatory DG signature circuit, because
`closePhase()` only checked the applicant's own form field. Fixing it meant giving
the DG circuit (`dg_circuit_documents`, `entityType='pre_evaluation'`) its own
document identity alongside the applicant's - but `upload_assets.linkedOwnerType`/
`linkedOwnerId` supports exactly one linked owner per asset, ever (`linkLockedAsset`'s
`WHERE isNull(linkedOwnerType)` guard), and file-access authorization
(`file-access.policy.ts`) resolves purely from that single link: the M3 stage grants
DN only, while only the `dg_circuit` stage grants Reception/Assistant DG. Sharing one
`upload_assets` row between the applicant's document and the circuit's document was
therefore not an option - whoever "owned" the link would determine who could read the
file, and no single owner type grants both DN and Reception/Assistant DG access.
Resolved by copying the file server-side on submission (STORAGE-3B/3C pattern: write
to disk under `generated/...` before the transaction, `insertAssetWithAddress` inside
it, `cleanupGeneratedFileOnFailure` on any rollback) into a second, independent
`upload_assets` row owned by the circuit document. Verified in the runtime UAT that
the applicant's asset and the circuit's asset always get distinct ids.

## 15. Role keys stay technical; métier names live in `@aidn/shared` (SESSION1-ROLE-1)

DN Session 1 renamed two roles for the business: `r3_agent` is the Cellule Inspection / Agent CI and
`s5_agent` is Finance / Agent Finance. The keys `r3_agent` / `s5_agent`, the DB enum values, API routes
(including `/paiements-s5`), DTO fields (`r3AgentId`), and S5/R3-named files and components are kept
unchanged: renaming them would force a data migration and churn routes, bookmarks and tests for no user
benefit. Only displayed wording changed.

`INTERNAL_ROLE_LABELS` / `INTERNAL_ROLE_GROUP_LABELS` (`Record<InternalRole, string>`) and the
`internalRoleLabel()` helper in `packages/shared/src/statuses.ts` are the single source for role display,
so a new role fails to compile until labelled. The admin header uses it instead of printing raw keys.
New role `assistant_dn` (Assistante DN, group DN) added to the shared constant and the PG enum
(migration `0007_session1_role1_assistant_dn`, a single `ADD VALUE`). It has no workflow permission yet:
SESSION1-M1-1 defines its guards. No permanent "absent from every guard" test is kept on purpose.

## 16. Directeur DN annotation circuit between the DG return and M3 (SESSION1-M1-1)

DN Session 1: after the DG annotates and Assistant DG uploads the annotated return, Assistante DN takes the
dossier to the Directeur DN and uploads his annotated return. Only that second return makes the request
`pending_review` and lets DN open M3. Terminology: « Annotation du DG », « Annotation du Directeur DN ».

- **Reuses `dg_circuit_documents`** with a new entity type `dn_director_annotation` (one row per dossier, unique
  index gives idempotency). It reuses the circuit/versioning/relocation primitives: a separate circuit row means a
  separate document chain, so the DG-annotated and the Directeur DN-annotated artifacts both stay. The technical
  statuses (`in_signature_circuit`, `signed`, `pending_review`) are reused but never displayed; labels come from
  `dn-annotation.stage.ts`.
- **Dedicated module `modules/dn-annotation/`** (`/api/dn-annotation-tasks`, `assistant_dn` + `SU`) and a dedicated
  admin page « Circuit Directeur DN » (`/circuit-directeur-dn`). `assistant_dn` is NOT in the `courrier-tasks`
  guard (Réception / Assistant DG keep theirs): least privilege and no role branches in the courrier page.
  `courrier-tasks` still manages only the 3 reception sources, so it cannot see or act on the DN circuit.
- **Copy-on-create.** The DG-annotated return is physically copied into the DN circuit (same pattern as #14), so
  `assistant_dn` never needs access to the DG circuit files.
- **Internal document.** File-access stage `dn_annotation` (assistant_dn, dn_agent, dn_supervisor, SU). Applicants
  and Réception / Assistant DG are denied, even though the owner type (`dg_circuit_document`) is shared with the
  applicant-visible DG circuit: the stage is resolved from the circuit's entity type (`file-context.ts`). Reason:
  the Director's annotation is an internal ANAC working document. Storage: `M1-circuit-dg/annotation-dn`.
- **One DG-return implementation** (`dn-annotation/intake-dg-return.ts`) used by `courrier-tasks.returnSigned` and
  `requests.returnSignedFromDg`: it does not touch `requests.status`. The legacy `mark-signed` /
  `mark-pending-review` intake routes (which could set `pending_review`) were removed.
- **Gate.** `openPreliminaryPhase` requires `requests.status = pending_review` AND DN circuit `pending_review`
  (`isPreliminaryOpenable`); the DN circuit is authoritative, the request status its projection.
- **Readers keyed by request id** were fixed to filter by entity type (requests list/cockpit/cancel/sendToSignature,
  reception dashboard, analytics `dgWaiting`, DG alert job, DN dashboard).
- **No automatic alert, no notification** for the Director circuit yet: the timing is recorded
  (`signatureSentAt`, `directorWorkingDays`), but the rule is to be validated with DN. The DG alert is unchanged
  (it now filters the reception entity types explicitly).
- **Grandfather.** A script (NOT a migration - see gotchas #23), `npm run db:backfill:dn-annotation`, run after
  `db:migrate`, creates a `pending_review` DN circuit (no document) for every intake circuit already past the DG
  return; idempotent, requests are not regressed and open dossiers keep working. Dossiers still in the DG
  circuit get their DN circuit when their DG return is uploaded. `db:reset:dev` stays an option for UAT.

## 17. Applicant confirmation / counter-proposal of M3/M4 meetings (SESSION1-MEET-1)

Spec: `docs/superpowers/specs/2026-10-14-session1-meet-1-design.md`. The DN proposes an M3 (`preliminary`) or M4
(`formal`) appointment; the applicant confirms or proposes another exact date-time with a remark; the DN accepts or
refuses (mandatory reason), or confirms on the applicant's behalf (mandatory note). M6 `site_visit` is outside.

- **Separate state.** `meetings.status` stays the lifecycle; `meetings.confirmation_status`
  (`awaiting_applicant | awaiting_dn | confirmed | not_required`) holds the negotiation, with the pending
  counter-proposal denormalised (`alternate_scheduled_at`, `alternate_remark`) and `confirmed_at`. Strict DB checks:
  awaiting_dn ⇔ both alternate fields; confirmed ⇔ confirmed_at; site_visit ⇔ not_required (extending confirmation to
  M6 later is a deliberate migration). One policy module: `meetings/meeting-confirmation.ts`
  (`isMeetingOperationallyConfirmed` = confirmed or not_required); a static test keeps the literals there.
- **History** = append-only `meeting_negotiation_events` (7 kinds incl. `dn_rescheduled`), exactly one actor
  (user XOR applicant) and per-kind payload checks. The audit log mirrors each step; it is not the source of truth.
  The applicant's « motif du refus » is read from these events, never from a mutable column.
- **Superseded rows are frozen** as they were (Fred, 2026-10-14): accepting an alternate or rescheduling marks the old
  row `rescheduled` without touching its confirmation fields (clearing them would violate the strict checks).
- **Accepting an alternate** inserts the confirmed replacement first, then retires the old row, in one transaction:
  a taken slot rolls everything back. `rescheduleMeeting` now works the same way (it used to retire the old row
  first and outside a transaction, so a slot conflict left the phase without a live meeting); a DN reschedule of
  an M3/M4 meeting is a NEW proposal the applicant must confirm again.
- **Every scheduled row reserves the agent's slot**, confirmed or not; the pending alternate does not (first
  accepted wins). Held / no-show / dossier cancelled require an operationally confirmed meeting; phase closing still
  refuses a `scheduled` meeting, so a negotiation blocks M3/M4 closing as before.
- **Invitation PDF** only for an operationally confirmed meeting (409 `MEETING_INVITATION_NOT_CONFIRMED`); no
  proposal PDF.
- **Audit actor**: `scheduleMeeting` records the acting user (assigned agent in `details.dnAgentId`); the module
  comes from the phase (no hard-coded M3). Applicant actions are audited with the new `audit_logs.applicant_id`
  (never both ids); activity feeds show the applicant's name. The R3 dashboard activity also matches
  `details.dnAgentId`, so a visit scheduled by the DN still shows for the assigned agent.
- **No notification / e-mail** (deferred): visibility is the portal banner « Rendez-vous à confirmer » and the admin
  « Contre-propositions à traiter » metric and « Rendez-vous à traiter » list (any date, open dossiers only).
- **Legacy**: migration 0009 sets existing M3/M4 rows `confirmed` (`confirmed_at = created_at`, a technical proxy
  never shown as a KPI) and M6 rows `not_required`, in the same migration (enum types created there - safe, see
  gotchas #23); no backfill script.

## 18. SESSION1-MEET-2 - signed return of the meeting compte rendu (2026-10-15)

- M3/M4 only; M6 has no DN CR and no signed copy (API guard `acceptsMeetingReport`, DB check for the signed copy).
- Two independent chains on the same meeting id: `meeting_report` (DN, `meetings.cr_document_url`) and `meeting_report_signed` (applicant, `meetings.signed_cr_document_url`).
- The DN CR is frozen once a signed copy exists (409 `MEETING_REPORT_FROZEN_SIGNED`). Exceptional corrections are handled manually outside the workflow until a rectification mechanism is validated.
- The applicant uploads the signed copy once (D3 revised before push): a second file is a 409 `MEETING_SIGNED_REPORT_ALREADY_SUBMITTED` (« … contactez la Direction de la Navigabilité »), nothing is trashed. A correction workflow is a future task.
- Portal surfaces the pending signed copy from `canSubmitSignedReport` only: M3/M4 phase summary (« Action requise — Compte rendu à signer », after the phase-blocking actions), dossier banner, dashboard `ReportsToSignBanner`. A closed phase still awaiting it opens by default and allows the upload (exception to read-only closed rows, because the API rule is dossier-open).
- No DN validation, no notification, no cockpit metric; phase closure needs neither file.
- Audit `MEETING_SIGNED_REPORT_SUBMITTED` (applicant actor), one per meeting, one activity label.
- Migration 0010: ADD VALUE + two nullable columns + check; no backfill.

## 19. SESSION1-UX-1 - applicant actions and operational next actions (2026-10-16)

Spec: `docs/superpowers/specs/2026-10-15-session1-ux-1-design.md`.

- **API is the source of truth for `ApplicantAction[]`** (`GET /api/applicant/actions`, `applicant-actions/`): eligibility, order, anchor, `dueAt`, `urgent`, `count`, `variant`. Only actions actually expected from the applicant, never passive states. 8 keys: `meeting_confirmation 10, payment_proof 20, document_correction 30, formal_letter 40, formal_missing_documents 50, preliminary_declaration 60, signed_meeting_report 80, certificate_collection 90` (below 80 = blocks the phase). `URGENCY_WINDOW_HOURS = 72` orders only (no SLA): urgent first by `dueAt`, then base priority, then reference, then id. `loadApplicantActionRows` = exactly 8 queries whatever the number of dossiers.
- **Two predicate levels** in `@aidn/shared/applicant-actions.ts`: `can…` (the route accepts, reused by the write-service guards with unchanged error codes and claim order) and `expects…` (the action is shown); `expects ⇒ can` is tested. `pending_validation` proofs stay replaceable but are not expected.
- **M4 missing piece** = `isFormalDocumentMissing` = the closure-gate rule (`DOCUMENTS_INCOMPLETE`); all 11 slots are mandatory, no applicability rule. Pieces are actionable from M4 opening (no letter gate).
- **MEET-1 kept**: an unanswered past meeting stays an action (overdue → urgent); no expiry.
- **D11**: payment presentation/expectation use `status === 'awaiting_proof'`; `rejection_reason` only selects the « Nouvelle quittance requise » wording; no data change.
- **Portal**: wording keyed by action (`lib/actions/copy.ts`); the portal never sorts. Dashboard « Actions requises » replaces `MeetingsToConfirmBanner` / `ReportsToSignBanner`; dossier banner = first action of the dossier, phase summary = first action of the phase; phase builders are passive only. The banner is withheld while actions load; after an actions error the passive banner reads « Situation du dossier ». Neutral wording: no « en cours de traitement / analyse / vérification » for upload-only states.
- **Admin**: `OperationalCallout` (states action_required / waiting / information / done / blocked) with `NextActionOwner { kind: 'staff' | 'applicant' | 'external'; label; roles? }` (staff roles = the route's `requireRole` list, SU included) and `canAct` (staff owner ∩ session roles). No disabled button for another role's work; a navigation-only « Consulter la phase » link when the user cannot act.
- **Demandes cockpit** (D9): pre-phase branches with explicit owners (Réception print, Assistant DG, Assistante DN / Directeur DN paper circuit); open phase: DN parallel work (counter-proposal, M5 documents without verdict) → applicant expected (same builder, `signed_meeting_report` never a waiting reason) → Finance → Cellule Inspection → DG circuits → DN. Reuses `loadApplicantActionRows({ includeClosedDossiers: true })` instead of re-reading phases / circuits / formal documents / evaluations; 13 fixed statements (14 with a viewer), no table read twice except `audit_logs` (2, pre-existing).
- **Admin phase helpers** mirror that order with typed owners (Finance for invoices / validation, applicant for proofs / pieces / corrections / confirmations). Ruling: M7 « Retrait à enregistrer » stays a DN action on the phase page (the DN records it) while the cockpit says the applicant is awaited.
- No migration. Deferred to SESSION1-COCKPIT-1: role dashboards and their next-action strings, cockpit metrics, server-side phase rail, sharing `OWNERS` between API and admin.

## 20. Role cockpits are their work queues (SESSION1-COCKPIT-1, 2026-10-16)

Spec: `docs/superpowers/specs/2026-10-16-session1-cockpit-1-design.md`.

- **Shared contract (Option C)**: the operational vocabulary (bucket, state, owner, action key, urgency, `OPERATIONAL_OWNERS`) lives in `@aidn/shared`; each domain keeps its own read model (courrier tasks, DN circuit, Finance payments, site-inspection `getMyQueue`). No generic cross-domain queue.
- **`items` / `counts`**: every queue returns `{ items, counts }` computed server-side from the same rows; `inactive` (closed dossier or phase) is listed but excluded from every action bucket count (B1). The overview is queue metrics derived from rows, with no `audit_logs` query.
- **Role dashboards retired** (Réception, Finance/S5, CI/R3): pages, clients and the three endpoints `/dashboard/{s5,reception,r3}-summary` are deleted. Only the DN dashboard (`/dashboard/summary`) remains, behaviour unchanged. Caller audit: all three per-phase payment queues were removed and no unexpected consumer exists.
- **`homeFor` precedence**: DN roles / SU keep the DN dashboard, then s5_agent, r3_agent, reception / assistant_dg, assistant_dn; `courrierDefaultTab`: Assistant DG alone starts on « Retour DG attendu ». Approved waiting mode: a queue tab can be « En attente » (waiting on someone else) instead of « À traiter »; stale `?id=` selections are cleaned up.
- **B4**: a site visit can be marked held only with a validated payment, via compare-and-set; refusals return 409 `SITE_VISIT_PAYMENT_NOT_VALIDATED` / `MEETING_NOT_SCHEDULED`. B1-B6 fixed (closed dossiers, Finance invoice delay that could never fire, rejected dossier as Finance work, second CI state machine, courrier initial requests sent to the Assistante DN).
- **D7** « Annotation du DG » (replaces circuit-signature wording); **D8** « preuve de paiement » (replaces « quittance »).
- **Urgency uses only existing parameters** (`DASHBOARD_SLA_DEFAULTS` moved to `operational/thresholds.ts`); no new system parameter. Finance bucket literal: `FINANCE_BUCKETS[2]` is used instead of the literal because of the MEET-1 literal guard.
- **Finance list stays unbounded** as before (follow-up: server-side history window). Portal DG wording is a follow-up.
- No migration.

## 21. Shared endpoints choose the session by app, never by fallback (BUG-PORTAL-INTAKE-1, 2026-10-16)

- `authenticateEither` extends STORAGE-0A A1 to every shared endpoint. The calling app is `Origin`, else the origin
  of `Referer` (browsers omit Origin on same-origin GETs through the proxy), matched exactly against `PORTAL_ORIGIN` /
  `ADMIN_ORIGIN`; an equal pair of env values counts as unknown.
- Portal -> `authenticateApplicant` semantics (missing cookie 401 « Non authentifié. », expired or invalid 401
  `TOKEN_EXPIRED` so the portal refreshes); admin -> `authenticate`. The other session is never consulted.
- Unknown app (curl, scripts): the single valid session; both valid -> 401 `AMBIGUOUS_SESSION` (A1 message); none -> 401.
  Staff-first is gone.
- Root cause of « applicantId requis pour une saisie manuelle. » on a portal submission: an absent or expired applicant
  token fell back to a valid staff session. No migration, no frontend change.

## 22. Applicant account edit (SESSION1-ACCOUNT-1, 2026-10-16)

Spec: `docs/superpowers/specs/2026-10-16-session1-account-1-design.md`.

- Staff and applicant are separate identity domains: applicant-email uniqueness checks `applicants` only (on `lower(email)`, tolerant of legacy mixed-case rows); a staff `users.email` never blocks it.
- Editable from admin: `fullName`, `email`, `phone`, `contactOrder` (descriptive only). `organisationId` (dossier ownership), password and `active` are not editable there; unknown body keys are ignored (whitelist). PATCH semantics: absent = unchanged, `phone: null`/blank clears.
- Every field is validated before the duplicate check (400 wins over 409); a unique-index race maps to 409 `APPLICANT_EMAIL_EXISTS`.
- Update and `APPLICANT_ACCOUNT_UPDATED` audit share one transaction with a row lock; `details = { changedFields, changes: { field: { from, to } } }`, never password data; a no-op returns 200 with no audit row.
- No forced logout on email change: no authorization reads the token email claim; `/me` and refresh reload by `applicantId`; the next login needs the new email. No token revocation.
- No migration, no `updatedAt`: history lives in `audit_logs`.

## 23. Analytics time model and role analytics foundation (ROLE-ANALYTICS-1B, 2026-10-16)

Spec: `docs/superpowers/specs/2026-10-16-role-analytics-1b-design.md`.

- Storage basis UTC: every DB session is pinned to `TimeZone=UTC` (gotchas #27). Business/reporting time zone
  `Africa/Libreville` (fixed UTC+1); role-analytics periods are half-open UTC ranges built from Libreville days
  (`modules/analytics/period.ts`), never from the server's local time. Custom dates are inclusive for the user,
  366 days at most.
- Durations default to calendar days; the DG overdue alert stays in working days, phase SLA in calendar days. Every
  role-analytics duration states its unit.
- Phase SLA targets come from `dashboard_sla_phase_m*_days` (`loadThresholds`), the same source as the DN dashboard.
  The 45-day processing warning, 15-day inactivity and aging buckets stay legacy constants (not parameters).
- B1 in `/analytics/overview`: closed dossiers are not current blockers (open phases, SLA breaches, DG waiting,
  payment blockers); history (phases closed in the period, durations, SLA compliance) keeps them.
- Semantic audit events (`modules/analytics/audit-events.ts`) map business events to current and legacy audit
  actions, verified against emitters; meeting-type-dependent actions (`MEETING_*`) are not catalogued.
- Role analytics: `GET /api/analytics/roles/:domain` (semantic keys only), access matrix `ROLE_ANALYTICS_ACCESS`
  in `@aidn/shared` (inspection `service` = SU only; no `dn_supervisor` role dashboard); `/overview` stays
  dn_supervisor + SU. Providers arrive with 1C-1E; until then the route answers 501, never placeholder values.
  No `heldAt` (1E decision), no `/pilotage` UI (1F), no migration.

## 24. Courrier and Assistante DN role analytics (ROLE-ANALYTICS-1C, 2026-10-19)

- Event time = the circuit row's business timestamp (`signature_sent_at`, `signed_at`, `pending_review_at`), never
  the audit time nor `requests.updated_at`. Actor = the latest audit row of the event's catalogued actions (current
  + legacy) for that circuit: `circuit` actions by `entity_id = circuit id`, legacy `request` actions
  (`DG_CIRCUIT_SENT_TO_SIGNATURE`, `DG_CIRCUIT_SIGNED`, `DG_CIRCUIT_SIGNED_RETURNED`) by `entity_id = request id` on
  the intake circuit; narrowed by `audit_logs.request_id` (indexed, backfilled by 0005). One event per circuit row,
  whatever the aliases. A row without a correlated audit counts for the service, for nobody's `mine`, no actor shown.
- DG return = `signed_at` on every path; the hand-over to the DN (`pending_review_at` only) is never a DG return.
  Directeur DN return = `pending_review_at` on a row that was sent (grandfathered rows excluded).
- Scope: `mine` = attributed event counts + activity only. Durations (process time at the DG / Directeur DN, not an
  agent's performance) and the shared current queues are `service` only, never shown as personal numbers.
- Durations: calendar days, completed in the period (end timestamp in range), negative or incomplete samples left out.
  Directeur DN durations are informational (no SLA, D10): info severity only.
- Current state = the cockpit queues (`listCourrierTasks`, `listDnAnnotationTasks`): buckets, urgency and closed
  dossiers (B1) are not recomputed. History keeps now-closed dossiers.
- `previousValue` on event counts only: the same-length range just before (Libreville days; a month preset compares
  with the same number of days, not the previous calendar month).

## 25. Finance role analytics (ROLE-ANALYTICS-1D, 2026-10-19)

- Validation = the payment row: `validated_at` / `validated_by` are written once under the row lock and never
  rewritten (a validated payment takes no new invoice or proof), so time and actor are authoritative; the
  PAYMENT_VALIDATED audit row is not read (no double event).
- Invoice upload, proof upload, rejection = audit events: the row keeps only the latest invoice / proof timestamp and
  the latest rejection, so each audit row is one event (re-uploads and repeated rejections count), timed by
  `created_at`, joined to payments / phases (M5-M7 only).
- Targeted time caveat: audit-timed metrics carry `reliability: caveat`, `caveatKey: legacy_db_timezone` until
  production history is checked (gotchas #27); metrics on app-written row timestamps stay reliable.
- Proof uploads are applicant actions (the audit row has no actor): `finance.proof_received` and their activity rows
  (`actor: { kind: 'applicant' }`, no identity) are service only, never a staff member's `mine`.
- `finance.average_validation_delay`: latest proof -> validation, validation in the period, service only, caveat
  `latest_proof_only` (earlier proofs of a rejection cycle left no timestamp).
- Deferred: rejection delay (a rejection cannot be tied to the proof it refused once a new proof overwrote the
  timestamp), applicant proof deadline (no parameter), index on `payments.validated_at` (small table; no migration).

## 26. Cellule Inspection role analytics (ROLE-ANALYTICS-1E, 2026-10-19)

- heldAt: no migration (option A). The only held path for a site visit is `markAssignedSiteVisitHeld` (generic status
  refused since BUG-MEETING-SITE-VISIT-STATUS-1), audited SITE_VISIT_HELD by the assigned agent. The metric is named
  `inspection.visit_held_recorded`: the time the system recorded it, caveat `recorded_time_not_actual_visit_time`
  (also covers the pre-UTC audit offset). A future `meetings.heldAt` would still be a recording time, so it would not
  make the metric more honest; revisit only if a business need for the physical visit time appears.
- Opinion time = the M6 closure (`phases.closed_at`, app-written by `submitInspectionVerdict`; a closed M6 takes no
  verdict), actor = `site_inspections.r3_agent_id`; not `site_inspections.submitted_at` (DB default, offset in
  pre-UTC history). Verdicts reported under their stored enum values.
- Planned visits: `scheduled_at` in the period, superseded slots (`rescheduled`) excluded; one key (workload, not
  work done); mine = assigned agent (`meetings.dn_agent_id`), never the DN scheduler.
- Current state comes from `getMyQueue`, in both scopes: CI missions are assigned to one agent (D14), so `mine` is a
  real personal queue. Payment-blocked visits are a separate info warning (waiting on Finance / the applicant), never
  an overdue visit. Awaiting-opinion carries no `oldest`: the queue's step start there is the scheduled date.
- Deferred: visit -> opinion delay (no actual held time), site-visit no-shows (no path records one any more), a
  transaction around `submitInspectionVerdict` (insert + phase closure + audits are separate statements: workflow fix,
  out of scope).
