# 📝 AIDN v2 — Changelog

Commit-level history. Covers `be9fce9` through `b64a073` (2026-07-07, single day).

## (uncommitted) — admin polish/hardening pass, portal left broken

Not yet committed as of this update. On top of `b64a073`:
- `apps/admin/src/lib/axios.ts` added — hardened refresh-queue axios client,
  replacing `lib/api.ts`'s single-promise version (`project/decisions.md` #10)
- Repo-wide `.prettierrc` (present since Sprint 0, never enforced) actually applied
  across admin/portal source (`technical/gotchas.md` #12)
- `apps/admin/vite.config.ts`: `@` alias, dev proxy to the API, explicit build config
- `apps/admin/tsconfig.json`: target `ES2022` → `ES2020`, `allowImportingTsExtensions`
  added (rationale unconfirmed)
- `apps/api/package.json`: `seed:params` script added
- `apps/admin/components.json` (shadcn config) appeared — confirm this wasn't
  produced by running the shadcn CLI, which the project has deliberately avoided
- AppShell sidebar widened; "Utilisateurs" nav label → "Gestion des utilisateurs"
- `docs/TASKS.md` corrected/caught up (19→20 tables, UI-redesign section documented)
- **Left broken**: portal's `LoginPage.tsx`/`MyRequestPage.tsx` now import a
  `lib/axios` that was never created for the portal app — see
  `active-session/blockers.md` #B0. Do not push this diff as-is.

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
