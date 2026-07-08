# 🎯 Current Task

**Session date**: 2026-07-08 (follow-up fix session; prior work below is 2026-07-07)
**Status**: Sprint 0 + Sprint 1 committed and pushed (`b64a073`, `2205261`). The
admin polish/hardening pass from 2026-07-07 left both the admin and portal builds
broken; this session found and fixed both, plus a related sessionStorage bug, and
is ready to commit/push. Next up after that: Sprint 2 (Phase Préliminaire, M3).

## ✅ Done today (2026-07-08): fixed both broken builds, ready to commit

- Created `apps/portal/src/lib/axios.ts`, mirroring `apps/admin/src/lib/axios.ts`'s
  queued-refresh logic but pointed at `/applicant-auth/refresh` — closes
  `technical/gotchas.md` #11
- Switched `apps/portal/src/hooks/useApplicantAuth.tsx` off the old `lib/api.ts`
  onto the new `lib/axios.ts`; deleted both now-orphaned `lib/api.ts` files
  (admin + portal)
- Fixed a second, previously-undocumented broken build: `apps/admin/src/hooks/
  useAuth.tsx` imported from a doubled `@/src/lib/axios` path — changed to the
  plain relative `../lib/axios` — see `technical/gotchas.md` #14
- Fixed a related bug found in the same investigation: the `sessionStorage` key for
  the "session expired" message was written as `session_expired` (English) but read
  as `session_expiree` (French) in admin's `LoginPage.tsx` — never matched.
  Standardized on `session_expired`, and added the same read+clear check to portal's
  `LoginPage.tsx` (which had none) — see `technical/gotchas.md` #15
- `apps/portal/vite.config.ts` brought up to parity with admin's: `@` alias, dev
  proxy to the API (`/api`, `/uploads`), explicit build output config
- `docs/TASKS.md` and `active-session/blockers.md` updated to mark the prior
  session's blocker resolved
- All verified via typecheck + build + dev-server-boot (see `active-session/
  blockers.md` B2 — no browser rendering available in this sandbox)

## 🟢 Previously done (2026-07-07, uncommitted at the time): admin polish pass

- Hardened `apps/admin/src/lib/axios.ts` with a proper concurrent-401 refresh queue,
  replacing the naive single-promise version in `lib/api.ts` — see
  `project/decisions.md` #10
- Applied the repo's existing (but never-enforced) `.prettierrc` across admin/portal
  source — `technical/gotchas.md` #12
- `apps/admin/vite.config.ts`: added `@` alias + dev proxy to the API (`/api`,
  `/uploads`) + explicit build output config
- `apps/admin/tsconfig.json`: target dropped `ES2022` → `ES2020`, added
  `allowImportingTsExtensions` — reason not yet documented, confirm with Fred before
  relying on it
- `apps/api/package.json`: added `seed:params` script wrapping
  `seed-system-parameters.ts`
- `apps/admin/components.json` appeared (shadcn config) — worth confirming this
  wasn't produced by actually running the shadcn CLI, since `project/decisions.md`
  #8 and `technical/cheat-sheet.md` both say not to
- AppShell: sidebar widened (174→226 / 45→60 px), "Utilisateurs" nav label renamed to
  "Gestion des utilisateurs"
- `docs/TASKS.md` corrected (19→20 tables) and caught up with a
  "Correction post-implémentation" section documenting the earlier UI redesign
- This pass was committed as `2205261` — but it left the two build-breaking bugs
  above, found and fixed in today's session

## Previously done (committed, `b64a073`): Sprint 0 + Sprint 1 + full UI redesign

## ✅ Done today: Sprint 0 (feasibility study + scaffold)

Full detail in `sessions/2026-07-07.md`. Summary:

- 13-module Q&A feasibility study conducted against the CDC (mirrors the SICOT
  methodology) — see `project/modules-feasibility.md`
- 6 cross-cutting patterns identified and documented before any code —
  `technical/cross-cutting-patterns.md`
- Stack decided: React+TS+Tailwind / Express+TS / **PostgreSQL + Drizzle** (not
  Mongo, despite the legacy `aidn-v2-legacy` using it) — see `project/decisions.md` #1
- Monorepo scaffolded (`apps/api|admin|portal`, `packages/shared`), verified with a
  real `npm install` + typecheck + build + API boot, not just written
- Full PostgreSQL schema written (20 tables), verified with `drizzle-kit generate`
  producing real migration SQL

## ✅ Done today: Sprint 1 (Intake & Circuit DG, M1+M2) — API + full UI

- Auth prerequisite built first: staff auth (matricule+OTP, mirrors SICOT), bootstrap
  SU flow, users management API, `system_parameters` (SICOT's `parametres`
  equivalent)
- M1 business logic: submit/sign/pending-review/cancel, one-active-request DB
  constraint, `DEM-YYYY-MM-DD-ORGCODE-NN` reference generator, stuck-parapheur alert
  cron (notifications only, email deferred to Sprint 10)
- **Gap caught by Fred, not by me**: initial "testing" used a staff token standing
  in for a postulant — applicant auth didn't exist. Built properly afterward
  (`modules/applicant-auth/`), see `project/decisions.md` #5
- **UI/UX gap caught by Fred, not by me**: first pass at admin/portal auth screens
  only reused SICOT's color tokens, not its actual component structure. Rebuilt
  Bootstrap/Login/Layout to genuinely match — react-hook-form+zod, framer-motion,
  shadcn-style primitives. Added a Users management page in the process (SU-only,
  not originally scoped — needed to make the multi-role system usable at all via UI)
- 10 real bugs found and fixed along the way — all documented with symptom/cause/fix
  in `technical/gotchas.md`, most notably a confirmed upstream `drizzle-kit` CLI bug
  that silently swallows migration errors

## Progress Tracker

```
Sprint 0  Feasibility, patterns, conventions, stack, schema, scaffold   ██████████ 100% ✅
Sprint 1  Intake & Circuit DG (M1+M2), API + full UI                    ██████████ 100% ✅
Auth/Users/Bootstrap (prerequisite, added mid-Sprint-1)                 ██████████ 100% ✅
──────────────────────────────────────────────────────────────────────────────────
Sprint 2  Phase Préliminaire (M3)                                       ░░░░░░░░░░   0%
Sprint 3-12                                                             ░░░░░░░░░░   0%
```

## Leftover items (not blocking, tracked in `docs/TASKS.md`)

- [ ] Rename `aidn-v2` (legacy) → `aidn-v2-legacy` (pure housekeeping, Sprint 0 task,
      never blocking)
- [ ] M13 applicant account creation (self-registration, anti-bot, org dedup) — the
      portal login only works today for applicants already seeded directly in the DB
- [ ] Admin/portal production bundle exceeds 500kB after minification (Vite warning,
      not an error) — worth code-splitting once more pages exist, not urgent now
- [ ] Visual verification of the redesigned Bootstrap/Login/Layout — Claude cannot
      render a browser in its sandbox; typechecked/built/dev-server-booted only
