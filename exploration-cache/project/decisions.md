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
