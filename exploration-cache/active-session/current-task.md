# 🎯 Current Task

**Session date**: 2026-07-28
**Status**: Sprint 0–6 (M1–M7) remain feature-complete end-to-end. Current work
is post-M7 workflow hardening before the broader transverse modules. Workstream A
was already complete; the latest pass adds phase-level workflow summaries across
M3–M7, strengthens M4 formal document traceability, and completes Part C-V1
(integrated document viewer, M5 first), and resolves the internal-user side of the
Personnel ANAC account-management blocker.

## ✅ Done today (2026-07-28): workflow hardening + C-V1 document viewer

- Added reusable phase-level workflow summaries across the dossier:
  - shared `PhaseWorkflowSummary` for M3, M5, M6, M7
  - M4 keeps a dedicated formal summary because its document/DG-circuit rules are
    denser than the other phases
  - summaries show next action, owner, blocker, and compact metrics
- Hardened M4 Demande Formelle UX:
  - closure UI now mirrors the server gate: letter transmitted to DN + 11/11
    documents deposited + meeting resolved
  - compte-rendu remains explicitly optional
  - document rows distinguish deposited evidence from review/acceptance
  - DN-only actions now show permission messaging
  - dossier cancellation asks for confirmation
- Added formal document traceability:
  - formal bundle returns current version upload date, version count, and whether
    previous versions exist
  - formal letter circuit now exposes file URL and version metadata
  - new formal letter uploads use `dg_circuit_document` as the version owner type,
    with a guarded legacy fallback for older local rows
- Completed Part C-V1 from the hardening plan:
  - new reusable admin `DocumentViewer`
  - integrated first in M5 `DocumentEvaluationsCard`
  - PDF iframe preview, image preview, DOC/DOCX fallback to open/download
- Implemented SICOT-style Personnel ANAC internal user management:
  - backend Personnel ANAC client and SU-only `/api/personnel-anac` module
  - admin Users page now has AIDN users + Personnel ANAC tabs
  - account creation validates matricule against Personnel ANAC by default
  - duplicate account detection shown in the ANAC tab
  - matricules are preserved canonically as 4-digit strings (`0041`, not `41`)
  - env template now includes `PERSONNEL_ANAC_*` and `PORTAL_ORIGIN`
- Updated local docs/cache/changelog and Notion project docs before push.
- Verification: `npm run typecheck --workspaces --if-present` and full
  `npm run build` pass. Existing Vite large-chunk warning remains.

## Current focus

Push this hardening/document-viewer/Personnel ANAC batch, then proceed with D-V1
collapse/expand for M4/M5 or C-V2 viewer rollout to M3/M4/M6/M7 depending on Fred's
preference.

---

## Previous baseline (2026-07-27)

Sprint 0–6 (M1–M7) are all fully committed and confirmed working — API, admin,
and portal, typecheck clean across all 3 workspaces. **All 5 OMA certification
phases (Préliminaire → Demande Formelle → Évaluation Approfondie →
Démonstration/Inspection → Délivrance) are feature-complete end-to-end.** Real
certificate PDF generation confirmed working by Fred in his own environment (not
just typecheck — an actual test run).

## ✅ Done today (2026-07-27, continued): Sprint 6 (M7) complete, all phases done

- Certificate templates: went through several iterations with Fred (docx →
  HTML/CSS rebuild → several rounds of tag-structure fixes) before landing on
  a table-based HTML layout with a `renderCertificate(data)` JS function
  exposed for population — much easier to iterate on than the OOXML
  approach, and avoided the docx engine's page-frame/border rendering bugs
  hit along the way (see session log for the full story)
- API module `certificates` (M7): payment cycle (invoice/proof/validate/
  reject, mirrors M5/M6), certificate row created at payment validation
  (KPI zero-point), DN-entry fields (approval reference, dates, DG override,
  fixed 4-category scope details — NOT a dynamic list, locked with Fred),
  `POST /:certificateId/generate` (Puppeteer: setContent + evaluate +
  page.pdf()), status lifecycle printed→signed→archived→notified→collected
  (auto-closes M7 phase on collection, same pattern as M6)
- Admin: route `/demandes/:requestId/delivrance`, cards for payment/fields/
  scope/lifecycle
- Portal: `CertificatesSection` — proof-of-payment upload, simplified status
  (DN-internal steps collapsed to "en préparation"), no document download
  ever (certificates are always collected in person)
- **Puppeteer's Chromium download is blocked in this sandbox's network
  allowlist** (confirmed, tried multiple workarounds including apt-based
  Chromium/Firefox — both are snap-only on this Ubuntu version and snap
  doesn't run in this container). All Puppeteer-dependent work was
  typechecked but not executed here; Fred's own test is what confirmed it
  actually works.

## ✅ Done today (2026-07-27, continued): Sprint 5 (M6) portal UI + security fix

- `SiteInspectionSection.tsx` added to `ActiveRequestCard` — postulant uploads
  proof of payment (same pattern as M5's `DeepEvaluationSection`), sees site
  visit date/time/location and status read-only
- **Real bug caught mid-build, not just a feature note**: the API's
  `getBundle` was returning the R3 verdict+note (`inspection`) to *any*
  authenticated caller, including the applicant via `authenticateEither`.
  `modules-feasibility.md`'s doc-visibility section explicitly locks "avis
  R3" as DN-internal only. Fixed at the controller level — the field is now
  stripped server-side for applicant callers, not just hidden in the portal
  UI (hiding it in the UI alone would have left it visible in the raw API
  response / network tab)
- Sprint 5 (M6) is now feature-complete: API + admin + portal, typecheck
  clean on all 3 workspaces

## ✅ Done today (2026-07-27, continued): Sprint 5 (M6) API + admin UI

- API module `site-inspection` built and typechecked (see prior entry in this
  file for the full breakdown — API landed first, this entry covers the
  admin UI built right after in the same session)
- Added `GET /api/users/by-role/:role` — narrow, least-privilege lookup
  (dn_agent/dn_supervisor/s5_agent/SU, not gated SU-only like the rest of
  `/api/users`) so DN can populate an r3_agent picker when scheduling a
  site visit
- Admin: `pages/phases/site-inspection/` (page, hooks, PaymentCard,
  SiteVisitCard, VerdictCard, api/types/constants/helpers), route
  `/demandes/:requestId/demonstration-inspection`, `lib/api/site-inspection.*`
- Admin: `pages/inspections/MyInspectionsPage.tsx` at `/mes-inspections` — R3's
  own dossier queue, nav item scoped to `r3_agent`/`SU` in `AppShell.tsx`
- No manual closure card for M6 (unlike M3/M4/M5) — closure is automatic on
  verdict submission, server-side, matches the spec
- Typecheck clean on all 3 workspaces
- **Portal UI for M6 not started** — applicant-facing surface (if any; M6 may
  be internal-only, needs confirming) is the next real gap before Sprint 5
  can be called fully done

## ✅ Done today (2026-07-27): status correction + doc resync, starting M6

- This cache had drifted: it described Sprint 4 (M5) as "kickoff in progress"
  as of 2026-07-10. Direct inspection of the repo (not the cache) on
  2026-07-27 confirmed Sprint 3 (M4) and Sprint 4 (M5) are actually **fully
  built**: all 17 admin files + 2 portal files for `deep-evaluation` exist and
  are committed (`bf806d7`), all M4 formal-request files are committed, and a
  fresh `tsc --noEmit` on `apps/api`, `apps/admin`, `apps/portal` is clean
  with zero errors on all three. Fred independently confirmed via live app
  testing that M5 admin + portal are implemented and tested.
- Root cause: this file and `next-actions.md`/`blockers.md` were last updated
  2026-07-10 and never resynced after the M5 frontend batch was pushed.
  Lesson: trust the repo tree + typecheck over this cache when they conflict;
  update this cache at the end of every session from now on, no exceptions.
- Notion (dashboard + backlog DB) was also found stale — backlog rows for M3
  Formal, M4/M5 are still "Not started", dashboard shows Sprint 2 as not
  started. Both resynced same session (see Notion directly, not mirrored
  here).
- Certificate templates for M7 added to `docs/`: `CERTIFICAT_DAGREMENT_RAG-5_3.docx`
  and `CERTIFICAT_DE_RECONNAISSANCE_DAGREMENT_RAG-5_3.docx` — reviewed, field
  layout matches `certificate_type` enum (`agreement`/`recognition`) already
  in schema. Relevant when Sprint 6 starts: reference number, org
  name/address/phone/email, expiration date, Classe/Qualification/Limites
  table (variable rows), initial vs. current issue date, DG signatory name.
- Starting Sprint 5 (M6) now: `r3_agent` role and `site_inspections` table
  already exist in schema (schema-ready, zero endpoints/UI, confirmed via
  direct schema inspection). `r3_agent` reuses the existing staff
  `users`/`user_roles` auth — no separate login system, just a
  role-filtered dossier queue in admin (decision confirmed with Fred).

## ✅ Done 2026-07-10: uploads governance UI + Sprint 4 kickoff (M5)

- Finalized and pushed admin uploads governance controls in `Parametres`:
  - diagnostics consumption (`/api/uploads/diagnostics`)
  - manual orphan cleanup trigger (`/api/uploads/cleanup-orphans`)
  - dedicated settings hook/query-key/api/types wiring
- Included and pushed related API changes in the same batch:
  - `deep-evaluation` module files and error mappings
  - upload-governance related error handling alignment
- Started **Sprint 4 — Évaluation approfondie (M5)**, wired end-to-end kickoff:
  - API route mounted in server: `/api/deep-evaluation`
  - deep-evaluation routes for bundle/open/invoice/proof/payment verdict/reject,
    per-document verdicts + resubmission, and phase closure
  - admin route/page integration for deep evaluation phase
    (`/demandes/:requestId/evaluation-approfondie`)
  - admin React Query namespace `queryKeys.deepEvaluation.*`
  - portal active-request integration: new `DeepEvaluationSection` rendered when
    applicable on in-progress dossiers
- Renamed router file convention from `deep-evaluation.routes.ts` to
  `deep-evaluation.route.ts` to match project module naming style.

## ✅ Done today (2026-07-09, ongoing): post-Sprint-2 hardening pass

- Added **Parametres** page in admin (`pages/settings/SettingsPage.tsx`) and wired
  navigation/routing (`AppShell`, `App.tsx`)
- Exposed **system parameters** management API to match admin UI:
  `GET /api/system-parameters`, `PATCH /api/system-parameters/:key` (SU-only)
- Added **dev-tools reset module** (`/api/dev-tools/status`, `/api/dev-tools/reset`),
  SU-only and additionally gated by `ENABLE_DEV_RESET=true`
- Completed **meeting compte-rendu flow**:
  - API endpoint `POST /api/meetings/:id/report`
  - schema/view support via `cr_document_url` / `cr_uploaded_at`
  - admin upload action after meeting is marked held
  - portal display link when CR exists
- Tightened **phase closure business gate** for M3:
  - closure now requires a resolved meeting (not `scheduled`)
  - closure now requires a submitted preliminary declaration
  - note/document remain optional evidence
- Aligned preliminary declaration submission with M8-style document versioning
  (`document_versions` with trash-on-replace behavior)
- Added `in_progress` badge styling in admin requests list for clearer lifecycle
- Refactored admin M3 page into a maintainable module:
  - split `PreliminaryPhasePage.tsx` into dedicated components/hooks/helpers/api/types
  - migrated M3 hooks to React Query with query invalidation and centralized query keys
  - moved M3 api/types to shared `apps/admin/src/lib/api/`
  - wired global QueryClient in `apps/admin/src/main.tsx`
  - prepared lightweight Zustand store in `apps/admin/src/lib/stores/ui.store.ts`
  - introduced reusable `PhaseStatusBadge` visual primitive
  - added helper test scaffold (`runPreliminaryHelpersTests` in `helpers.test.ts`)
- Extended the same convention to other admin domains:
  - migrated auth state flow to React Query in `useAuth`
  - moved auth HTTP calls to `apps/admin/src/lib/api/auth.api.ts`
  - moved settings/dev-tools HTTP calls to `apps/admin/src/lib/api/settings.api.ts`
  - added settings domain hooks (`useSystemParameters`, `useDevReset`) and made
    `SettingsPage` an orchestration-only UI layer
- Added cross-app notification stack with shadcn Sonner:
  - toaster mounted in admin and portal app roots
  - `notify` helpers added in both apps
  - key login/settings/request flows now emit toast feedback
- Completed the portal-side React Query + shared `lib/api` migration for
  `MyRequestPage`:
  - split the page into `components/`, `hooks/`, `constants.ts`, and `lib/api/`
  - added portal `queryKeys` and `QueryClientProvider` wiring so request data
    uses React Query invalidation instead of manual reload state
  - kept the existing M3/M4 behavior intact while making the page easier to extend
- Started Sprint 3 backend groundwork (M4 formal request):
  - added `formal-request` API module and mounted `/api/formal-request`
  - implemented M4 open/bundle/letter circuit/document slots/close gates
  - added formal-request domain error handler and shared formal slot status constants
- Started Sprint 3 admin frontend groundwork (M4 formal phase):
  - added route `/demandes/:requestId/phase-formelle` in admin router
  - added new `pages/phases/formal/*` feature module with React Query hooks/actions
  - added `apps/admin/src/lib/api/formal.api.ts` + `formal.types.ts`
  - wired requests list/actions toward M4 page entrypoints
- Started Sprint 3 portal frontend groundwork (M4, incremental), then refactored it:
  - upgraded `apps/portal/src/pages/requests/MyRequestPage.tsx` with improved M3 labels/status rendering
  - added initial `FormalPhaseSection` for portal M4 letter/documents/meeting visibility and submissions
  - extracted portal request logic into dedicated API/hook/component modules and adopted the same React Query/data-layer convention as admin
  - included the current admin/api/portal changes in the same working batch so the cache reflects the full tree

## ✅ Done today (2026-07-08, this session): Sprint 2 — Phase Préliminaire (M3)

- **Phase lifecycle**: `POST /api/phases/requests/:requestId/start-preliminary-phase`
  opens M3 (moves the request to `in_progress`); `POST /api/phases/:id/close` closes
  it (doc attached or note, per the cross-cutting "Clôture de phase" pattern)
- **Meetings**: scheduling, status changes (`held`/`no_show`/`rescheduled`/
  `file_cancelled`, plus `scheduled` as the real initial status), reschedule.
  Hard conflict (same DN agent, exact same slot) blocked by the existing
  `meetings` DB constraint; same-day soft overlap surfaces as a non-blocking
  warning. Tickets are server-rendered HTML at `GET /api/meetings/:id/ticket` —
  **not** a generated/stored PDF, a deliberate scope decision (`project/
decisions.md` #12) since a real PDF generator is a cross-cutting M3/M4/M6 need
  better built once, later
- **Déclaration de pré-évaluation**: made available post-meeting (backed by a
  configurable template, see below), submitted by the applicant from the portal,
  dynamic return deadline (`system_parameters`, default 15 days)
- **New module, generalized ahead of M4**: `document_templates` — DN uploads/
  replaces blank template forms by key (versioned via the M8 pattern). Seeded with
  4 keys: `preliminary_evaluation_declaration` (M3, in use now) plus
  `dn_air_r2_3_f_e_010/011/012` (M4, schema-ready for Sprint 3). See
  `project/decisions.md` #11
- **Real security fix, not just a Sprint 2 feature**: `authenticateEither` could let
  a stale staff cookie win over a genuine applicant request, since admin/portal
  share a top-level domain and cookies aren't isolated between them. Now checks the
  cookie matching the request's `Origin` header first. See `technical/gotchas.md`
  #18 and `project/decisions.md` #13
- **6 real bugs found and fixed this sprint** (controllers crashing on empty
  request bodies — systemic, not just new code; a router-mount collision that
  silently blocked applicant access; check-ordering for a clearer error message;
  `packages/shared` drift from the schema's actual `meeting_status` default; a
  missing bundle endpoint for the portal; missing imports caught by typecheck) —
  full detail in `technical/gotchas.md` #15-#18
- Full admin UI (phase open/close, meeting scheduling/status/ticket, declaration
  tracking, document templates management page) and portal UI (ticket view, blank
  form download, filled declaration submission)
- Legacy repo actually renamed: `aidn-v2-legacy` — https://github.com/fredpatch/aidn-v2-legacy.git
- Verified via typecheck across `apps/api`, `apps/admin`, `apps/portal` — no browser
  rendering available in this sandbox (`active-session/blockers.md` B2, as usual)

## 🟢 Earlier today (2026-07-08, first session): fixed both broken builds

The `2205261` admin polish pass had left both apps' builds broken. Fixed and pushed
as `a4a5220` before starting Sprint 2 above:

- Created `apps/portal/src/lib/axios.ts` (was referenced but never created) and
  switched `useApplicantAuth.tsx` onto it; deleted both apps' orphaned `lib/api.ts`
- Fixed a doubled `@/src/lib/axios` import in admin's `useAuth.tsx` (broke the admin
  build too, previously undocumented)
- Fixed a `session_expired`/`session_expiree` sessionStorage key mismatch (admin) and
  added the missing check to portal
- Full detail in `sessions/2026-07-08.md` and `technical/gotchas.md` #10/#11/#12

## Previously done (committed, `b64a073`, `2205261`): Sprint 0 + Sprint 1 + UI + admin polish

Full detail in `sessions/2026-07-07.md`. Summary: 13-module feasibility study,
PostgreSQL+Drizzle scaffold, full M1+M2 API/UI, staff+applicant dual auth, Users
management, UI redesign to structurally match SICOT (not just color tokens), admin
axios refresh-queue hardening — 10+ real bugs found and fixed along the way.

## Progress Tracker

```
Sprint 0  Feasibility, patterns, conventions, stack, schema, scaffold   ██████████ 100% ✅
Sprint 1  Intake & Circuit DG (M1+M2), API + full UI                    ██████████ 100% ✅
Auth/Users/Bootstrap (prerequisite, added mid-Sprint-1)                 ██████████ 100% ✅
Sprint 2  Phase Préliminaire (M3), API + full UI + document_templates   ██████████ 100% ✅
Sprint 3  Phase Demande formelle (M4), API + full UI                    ██████████ 100% ✅
Sprint 4  Évaluation approfondie (M5), API + full UI                    ██████████ 100% ✅
──────────────────────────────────────────────────────────────────────────────────
Sprint 5  Démonstration/Inspection (M6), API + admin + portail            ██████████ 100% ✅
Sprint 6  Délivrance & Certificats (M7), API + admin + portail            ██████████ 100% ✅
──────────────────────────────────────────────────────────────────────────────────
Sprint 7-12 (transverse: Documents/Paiements/Réunions/Notifs/Dashboard/Admin) ░░░░░░░░░░   0%
```

## Leftover items (not blocking, tracked in `docs/TASKS.md`)

- [ ] M13 applicant account creation (self-registration, anti-bot, org dedup) — the
      portal login only works today for applicants already seeded directly in the DB
- [ ] Admin/portal production bundle exceeds 500kB after minification (Vite warning,
      not an error) — worth code-splitting once more pages exist, not urgent now
- [ ] Visual verification of the Sprint 1 + Sprint 2 UI — Claude cannot render a
      browser in its sandbox; typechecked/built/dev-server-booted only
- [x] `PORTAL_ORIGIN` env var added to `apps/api/.env.example` (2026-07-28)
- [x] Personnel ANAC integration for internal user creation added (2026-07-28);
      applicant account creation remains separate M13 work.
