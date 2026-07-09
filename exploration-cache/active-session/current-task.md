# 🎯 Current Task

**Session date**: 2026-07-09
**Status**: Sprint 0, Sprint 1, and Sprint 2 (M3) are now committed (`b64a073`,
`2205261`, `a4a5220`, `0e29d06`). The current session is a post-Sprint-2
hardening pass: admin settings area, system parameters API exposure, dev reset
tooling, meeting report upload flow, and stricter M3 closure gates. This work is
in progress and queued for commit.

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
- Planned follow-up: portal-side React Query + shared `lib/api` migration will be
  executed in a dedicated task (tracked in `docs/TASKS.md`), not in this pass

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
──────────────────────────────────────────────────────────────────────────────────
Sprint 3  Phase Demande formelle (M4)                                   ░░░░░░░░░░   0%
Sprint 4-12                                                             ░░░░░░░░░░   0%
```

## Leftover items (not blocking, tracked in `docs/TASKS.md`)

- [ ] M13 applicant account creation (self-registration, anti-bot, org dedup) — the
      portal login only works today for applicants already seeded directly in the DB
- [ ] Admin/portal production bundle exceeds 500kB after minification (Vite warning,
      not an error) — worth code-splitting once more pages exist, not urgent now
- [ ] Visual verification of the Sprint 1 + Sprint 2 UI — Claude cannot render a
      browser in its sandbox; typechecked/built/dev-server-booted only
- [ ] `PORTAL_ORIGIN` env var (new this sprint, see `project/architecture.md`) isn't
      in `apps/api/.env.example` yet — add it before handing the env template to
      anyone else
- [ ] Personnel/annuaire ANAC integration to replace Sprint 1's manual user creation
      — noted for Sprint 12 area, legacy `aidn-v2-legacy`'s `personnel/` module is
      the reference to check against once SICOT's real implementation exists
      (see `docs/TASKS.md`'s Sprint 12 section)
