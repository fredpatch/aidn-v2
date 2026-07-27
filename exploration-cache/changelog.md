# 📝 AIDN v2 — Changelog

Commit-level history. Covers `be9fce9` through the current uncommitted
2026-07-28 workflow hardening and document viewer pass.

## (uncommitted) — 2026-07-28 workflow hardening + C-V1 document viewer

On top of `origin/main`, current working diff:

- **Cross-phase UX hardening (M3-M7)**:
  - added a shared `PhaseWorkflowSummary` component for phase-level next action,
    responsible owner, blockers, and key metrics
  - wired the summary into M3 preliminary, M5 deep evaluation, M6 site inspection,
    and M7 certificates
  - kept the richer M4 formal summary card for the formal dossier's document-heavy
    workflow
- **M4 formal phase traceability**:
  - API/admin formal bundle now exposes formal document version metadata:
    `currentVersionUploadedAt`, `versionCount`, `hasPreviousVersions`
  - formal letter circuit now exposes its file URL and version metadata
  - new formal letter uploads now use the correct `dg_circuit_document` owner type,
    with a guarded legacy fallback for older local rows
  - document rows now say "déposé" and show current version info without implying
    review approval is required for closure
- **Part C-V1 — integrated document viewer**:
  - new reusable admin `DocumentViewer`
  - integrated first in M5 `DocumentEvaluationsCard`
  - PDF previews use iframe, images use img, DOC/DOCX/unsupported files fall back to
    "Nouvel onglet" and "Télécharger"
- **Project records updated**:
  - `exploration-cache/project/hardening-plan.md` records C-V1 implementation and
    remaining rollout
  - local docs/cache/changelog/task records updated before push
- Verified with `npm run typecheck --workspaces --if-present` and full
  `npm run build` (Vite large-chunk warning remains).

## (uncommitted) — 2026-07-10 Sprint 4 kickoff (M5 deep-evaluation)

On top of `4c75bf2`, current working diff:

- **Sprint 4 kickoff started** with new `deep-evaluation` integration across all apps:
  - API module mounted at `/api/deep-evaluation` in `apps/api/src/server.ts`
  - route/controller/service/types wiring under `apps/api/src/modules/deep-evaluation/*`
  - deep-evaluation routes: bundle/open/invoice/proof/validate/reject/verdict/resubmit/close
  - admin route and page entrypoint for deep evaluation phase
  - admin React Query key namespace: `queryKeys.deepEvaluation.*`
  - portal active request card now renders `DeepEvaluationSection` when applicable
- **Route naming convention alignment**:
  - renamed module file `deep-evaluation.routes.ts` -> `deep-evaluation.route.ts`

## `4c75bf2` — feat(admin,api): add uploads maintenance settings and include api updates

- Added admin Parametres upload-governance section (diagnostics + manual orphan cleanup)
- Added settings uploads hook/query-key/api/types integration in admin
- Included associated API updates in the same commit:
  - deep-evaluation module files and route integration
  - upload-related error mapping adjustments

## `19e5e48` — feat(api): add upload diagnostics, linking API, and orphan cleanup

- Added uploads diagnostics endpoint and service aggregation
- Added explicit upload link/relink admin API
- Added orphan cleanup API + scheduled cleanup job support
- Added system parameter seed for orphan retention defaults

## (uncommitted) — 2026-07-09 hardening pass (post-Sprint 2)

On top of `0e29d06`, 2026-07-09 ongoing session:

- **Admin settings area**: new `Parametres` route/page (`apps/admin/src/pages/settings/SettingsPage.tsx`) wired into `App.tsx` and `AppShell.tsx`
- **System parameters management surfaced in API/admin**:
  - new routes/controllers: `modules/system-parameters/system-parameters.route.ts`, `modules/system-parameters/system-parameters.controller.ts`
  - route mounted in `server.ts` at `GET /api/system-parameters` and `PATCH /api/system-parameters/:key` (SU-only)
- **Dev-only data reset tooling**:
  - new `modules/dev-tools/*` (status + scoped reset)
  - mounted at `/api/dev-tools` (SU-only + `ENABLE_DEV_RESET=true` gate)
  - supports scoped cleanup (`requests_and_workflow`, `organisations_and_applicants`, `notifications`, `audit_logs`, `reports`)
- **M3 meeting report flow completed**:
  - added meeting CR fields to schema/views (`meetings.cr_document_url`, `meetings.cr_uploaded_at`)
  - new endpoint `POST /api/meetings/:id/report`
  - admin phase page now uploads CR after meeting is held
  - portal request page now shows CR link when available
- **M3 closure logic tightened**:
  - phase close now requires a resolved meeting and submitted pre-evaluation declaration
  - closure note/document remain optional, but closure reachability is now guarded by workflow completeness
  - added explicit errors: `MEETING_NOT_RESOLVED`, `DECLARATION_NOT_SUBMITTED`, `MEETING_NOT_HELD`
- **Preliminary evaluation submission now versioned** through `document_versions` (same M8 version/trash pattern as other document flows)
- **Admin requests badge polish**: added `in_progress` status color mapping
- **Admin M3 page refactor for maintainability**:
  - split `pages/phases/PreliminaryPhasePage.tsx` into a compositional page + dedicated module folder `pages/phases/preliminary/`
  - extracted `types.ts`, `constants.ts`, `helpers.ts`, `api.ts`
  - extracted hooks (`usePreliminaryBundle`, `useMeetingActions`, `useDeclarationActions`, `usePhaseCloseAction`)
  - extracted UI components (`PhaseSidebar`, `MeetingCard`, `DeclarationCard`, `ClosureCard`, `PhaseStatusBadge`)
  - migrated hooks from custom local async state to **React Query** (`useQuery`/`useMutation`) with cache invalidation
  - centralized query key management in `src/lib/react-query/queryKeys.ts`
  - relocated M3 API calls/types to shared `src/lib/api/preliminary.api.ts` and `src/lib/api/preliminary.types.ts`
  - wired global Query Client in `main.tsx` (`QueryClientProvider` + devtools)
  - prepared Zustand baseline store (`src/lib/stores/ui.store.ts`) for future client-state needs
  - added helper test scaffold (`helpers.test.ts`, `runPreliminaryHelpersTests`)
- **Convention generalized beyond M3** (admin frontend data layer):
  - `useAuth` migrated from manual `useEffect/useState` fetch lifecycle to React Query-backed state
  - auth endpoints centralized in shared `src/lib/api/auth.api.ts` (+ `auth.types.ts`)
  - `LoginPage`/`BootstrapPage` now call shared auth API helpers (no direct auth HTTP calls in page code)
  - settings/dev-tools endpoints centralized in `src/lib/api/settings.api.ts` (+ `settings.types.ts`)
  - new domain hooks `pages/settings/hooks/useSystemParameters.ts` and `useDevReset.ts`
    use React Query + query-key invalidation, with `SettingsPage` reduced to orchestration/UI concerns
- **Cross-app notifications standardized with shadcn Sonner**:
  - added global toaster wiring to both admin and portal roots
  - added app-level `notify` helpers (`src/lib/notify.ts`) in both apps
  - connected notifications to key auth/settings/request actions (success/error/warning)
- **Portal convention refactor intentionally deferred**:
  - completed the portal `MyRequestPage` refactor into dedicated API/hook/component
    modules
  - added portal React Query query keys and `QueryClientProvider` wiring so the
    page now uses the same server-state pattern as admin
- **Sprint 3 kickoff (M4) — formal request backend started**:
  - new module `apps/api/src/modules/formal-request/*` (route/controller/service/types)
  - route mounted in `server.ts`: `/api/formal-request`
  - M4 opening gated by M3 closure; pre-creates 11 formal document slots
  - formal letter DG circuit implemented (`submitted` -> `signed` -> `pending_review`)
  - document slot uploads implemented with M8 version/trash pattern (`document_versions`)
  - M4 closure gates implemented: letter transmitted + 11/11 docs submitted + meeting resolved
  - added domain error mapping `handleFormalRequestError`
  - added `apps/api/src/shared/statuses.ts` with formal document slot constants/labels
- **Sprint 3 kickoff (M4) — admin frontend started**:
  - new admin formal-phase route `/demandes/:requestId/phase-formelle`
  - new feature module `apps/admin/src/pages/phases/formal/*` (page, hooks, cards, helpers, constants)
  - new admin API/types layer `apps/admin/src/lib/api/formal.api.ts` + `formal.types.ts`
  - React Query integration for M4 (`queryKeys.formal.bundle(requestId)` + invalidation flows)
  - requests list now links to both M3 and M4 pages when dossier is `in_progress`
- **Sprint 3 kickoff (M4) — portal frontend started (lightweight pass)**:
  - `apps/portal/src/pages/requests/MyRequestPage.tsx` updated with cleaner M3 section labels and API-origin link consistency
  - added initial `FormalPhaseSection` in portal for M4 read/submit flows (letter + document slots + meeting visibility)
  - later split into portal feature modules (`lib/api`, `hooks`, `components`, `constants`) and adopted the React Query convention

## (uncommitted) — Sprint 2: Phase Préliminaire (M3), full API + UI

On top of `a4a5220`, 2026-07-08:

- Phase lifecycle (`modules/phases/`): open M3 on a `pending_review` request,
  close with a doc or note
- Meetings (`modules/meetings/`): schedule, status changes (added `scheduled` as
  the real initial status), reschedule, hard-conflict DB constraint, HTML ticket
  (not a generated PDF — `project/decisions.md` #12)
- Preliminary evaluation declaration (`modules/preliminary-evaluation/`): made
  available post-meeting, portal upload of the filled form, dynamic return delay
- **New module, generalized ahead of M4**: `document_templates`
  (`modules/document-templates/`) — DN uploads/replaces blank forms by key,
  4 keys seeded (1 in use now, 3 ready for Sprint 3) — `project/decisions.md` #11
- **Security fix**: `authenticateEither` now prefers the cookie matching the
  request's `Origin` header, closing a stale-staff-cookie-wins gap
  (`technical/gotchas.md` #19, `project/decisions.md` #13)
- Full admin UI (`pages/phases/PreliminaryPhasePage.tsx`,
  `pages/document-templates/DocumentTemplatesPage.tsx`) and portal UI
  (`pages/requests/MyRequestPage.tsx` extended)
- 6 real bugs found and fixed: controllers crashing on empty request bodies
  (systemic, not just new code), a router-mount collision blocking applicant
  access, error check-ordering, a `packages/shared`/schema drift, a missing
  portal bundle endpoint, missing imports — `technical/gotchas.md` #15-#18
- Legacy repo actually renamed to `aidn-v2-legacy`
- Old reference `docs/*.diff` snapshots (redesign, schema, sprint1, sprint1-ui,
  axios-fix, exploration-cache) removed, replaced by fresh `aidn-v2-sprint2.diff`
  and `aidn-v2-personnel-note.diff`
- Verified via typecheck across `apps/api`, `apps/admin`, `apps/portal`

## `a4a5220` — fix(admin,portal): repair both builds broken by axios-hardening migration

Created `apps/portal/src/lib/axios.ts` (was referenced but never created), switched
`useApplicantAuth.tsx` onto it, deleted both apps' orphaned `lib/api.ts`. Fixed a
doubled `@/src/lib/axios` import in admin's `useAuth.tsx` (broke the admin build
too). Fixed a `session_expired`/`session_expiree` sessionStorage key mismatch.
Full detail in `sessions/2026-07-08.md`.

## `2205261` — feat(admin): harden axios refresh queue, prettier reformat, vite/tsconfig tweaks

The admin polish/hardening pass, on top of `b64a073`:

- `apps/admin/src/lib/axios.ts` added — hardened refresh-queue axios client,
  replacing `lib/api.ts`'s single-promise version (`project/decisions.md` #10)
- Repo-wide `.prettierrc` (present since Sprint 0, never enforced) actually applied
  across admin/portal source (`technical/gotchas.md` #13)
- `apps/admin/vite.config.ts`: `@` alias, dev proxy to the API, explicit build config
- `apps/admin/tsconfig.json`: target `ES2022` → `ES2020`, `allowImportingTsExtensions`
  added (rationale unconfirmed)
- `apps/api/package.json`: `seed:params` script added
- `apps/admin/components.json` (shadcn config) appeared — confirm this wasn't
  produced by running the shadcn CLI, which the project has deliberately avoided
- AppShell sidebar widened; "Utilisateurs" nav label → "Gestion des utilisateurs"
- `docs/TASKS.md` corrected/caught up (19→20 tables, UI-redesign section documented)
- **Left broken**: portal's `LoginPage.tsx`/`MyRequestPage.tsx` imported a
  `lib/axios` that was never created for the portal app, and admin's `useAuth.tsx`
  had a doubled-path import bug of its own — see the uncommitted fix pass above.

## `f07c6ed` — docs(exploration-cache): add cache and record uncommitted admin polish pass

Initial exploration-cache scaffold (this folder), documenting the then-uncommitted
admin polish pass and its broken-portal-build blocker.

## `be9fce9`, `7fce228`, `623139a` — first/second/third commit

Initial empty repo commits (placeholder), prior to the spec-first methodology
being applied.

## `02f34ec` — Scaffold aidn-v2 monorepo (apps, packages, tooling)

Full npm-workspaces monorepo: `apps/api` (Express+Drizzle skeleton),
`apps/admin` + `apps/portal` (Vite+React+Tailwind, ANAC design tokens wired),
`packages/shared` (module codes + status enum constants). Root `tsconfig.base.json`,
`.eslintrc.json`, `.prettierrc`. Verified via real `npm install` + typecheck +
build + API boot before being handed over.

## `af6c6c6` — fix: remove baseUrl (deprecated), use relative paths mapping instead

`technical/gotchas.md` #1-2. Removed `ignoreDeprecations` (invalid on the resolved
TypeScript version) and fixed the underlying `baseUrl` deprecation properly instead
of silencing it.

## `ad2b21d` — feat(api): schema init

Full 20-table Drizzle/PostgreSQL schema covering all 13 modules from the
feasibility study. Includes the two DB-level constraints enforcing locked business
rules: `requests_one_active_per_organisation_idx` (M1) and
`meetings_dn_agent_slot_idx` (M10 hard-conflict blocking). Verified with
`drizzle-kit generate` producing real migration SQL.

## `ac8a1dd` — feat(api): Sprint 1 diff auth + bootstrap + request flow

Auth/Users/Bootstrap prerequisite (matricule+OTP, multi-role via `user_roles`,
`system_parameters`) plus the M1 business logic module (`modules/requests/`) and
the stuck-parapheur alert cron job. `scripts/migrate.ts` added here, replacing the
raw `drizzle-kit migrate` CLI (`technical/gotchas.md` #3).

## `b64a073` — feat: admin/portal auth UI, applicant auth, uploads module, requests flow

Two things bundled into one push:

1. The missing applicant-auth module (`technical/gotchas.md` #7) and the generic
   uploads module (`technical/gotchas.md` #6, including the auth-gap fix)
2. The full UI redesign — Bootstrap/Login/Layout rebuilt to structurally match
   SICOT (react-hook-form+zod, framer-motion, shadcn-style primitives), plus a new
   Users management page (`project/decisions.md` #8-9)

Full cross-app flow verified against a real running Postgres instance before this
was pushed.
