# 🧠 Session Context

Last updated: 2026-07-09

## What a Fresh Session Needs to Know

You are working on **AIDN v2** (Application Informatique de la Direction de la
Navigabilité), an ANAC Gabon internal app for OMA (Organismes de Maintenance des
Aéronefs) certification. It's a fresh spec-first rebuild of a prior "vibe-coded"
version (`aidn-v2-legacy`), following the same methodology as the sister project
**SICOT** — feasibility study before code, exploration-cache for continuity.

**TypeScript monorepo, npm workspaces:**

- `apps/api` — Express 5 + Drizzle ORM + PostgreSQL
- `apps/admin` — React 18 + Vite + Tailwind — internal ANAC staff
- `apps/portal` — React 18 + Vite + Tailwind — postulant (applicant)
- `packages/shared` — module codes + status enums, consumed by all three

**The `@/*` alias** maps to each app's own `src/` — no shared `baseUrl` (removed,
see `technical/gotchas.md` #1-2).

**Code is entirely in English; UI text is entirely French.** This is a deliberate
difference from SICOT (which mixes both in server code) — see
`project/decisions.md` #2.

## Current Git State

```
branch: main
last commit: 0e29d06 feat(api,admin,portal): Sprint 2 - Phase Preliminaire (M3), full API + UI
status: DIRTY — post-Sprint-2 hardening pass in progress: admin settings page,
   system-parameters API route/controller exposure, dev reset module,
   meeting compte-rendu upload flow, and stricter M3 closure gates.
   See active-session/current-task.md.
```

## Critical Rules (Memorize These)

1. **`db:migrate` never calls the raw `drizzle-kit` CLI** — it runs
   `scripts/migrate.ts`, which calls `drizzle-orm`'s `migrate()` directly. The CLI
   has a confirmed bug (drizzle-kit@0.31.10) that silently swallows real errors.
2. **`packages/shared` must be built before its types resolve** — handled
   automatically by a root `postinstall` script, but if you ever see "Cannot find
   module '@aidn/shared'," that's why.
3. **Applicant tokens and staff tokens are never interchangeable** — both carry a
   `kind` field (`"staff"` or `"applicant"`), checked on every verify. An endpoint
   reachable by both (like demande submission) uses `authenticateEither`.
4. **Never trust `applicantId` from an applicant's own request body** — always take
   it from `req.applicant.applicantId` after `authenticateEither`/
   `authenticateApplicant`. Staff callers _do_ pass `applicantId` explicitly (manual
   entry on a postulant's behalf).
5. **The "one active demande" rule is a real DB constraint**
   (`requests_one_active_per_organisation_idx`), not just an app-level check —
   don't re-implement it in application code as the primary guard; catch the
   resulting Postgres unique-violation instead (remembering `error.cause.code`, not
   `error.code` — see gotchas.md #8).
6. **UI design system**: `react-hook-form` + `zod`, `framer-motion`, hand-written
   shadcn-style `Button`/`Input`/`Label` (no shadcn CLI — same reasoning as SICOT).
   Auth-specific shared pieces live in each app's own `pages/auth/components/`
   (duplicated between admin/portal, not yet extracted to a shared package).
7. **Always destructure `req.body ?? {}` in controllers** — a request with no
   body and no `Content-Type` leaves `req.body` `undefined`, not `{}`. This bit
   every controller written before Sprint 2 too — see `technical/gotchas.md` #15.
8. **Never give a router a blanket `router.use(authenticate, ...)` if another
   router's routes might get nested under its mount path** — it silently gates
   everything underneath before the intended middleware ever runs. See
   `technical/gotchas.md` #16.
9. **`authenticateEither` checks the cookie matching the request's `Origin`
   first**, not staff-always-first — admin and portal share a top-level domain,
   so both cookies can legitimately be present at once. See `technical/
gotchas.md` #19.

## Environment Assumptions

- Node.js ≥ 22, PostgreSQL ≥ 15 (Fred runs Postgres natively on Windows)
- `npm run dev` starts all three apps concurrently (API :4000, admin :5173,
  portal :5174)
- No Docker in use
- SMTP credentials will be reused from SICOT (env var names match exactly)

## How to Re-orient After a Break

1. Read `exploration-cache/active-session/current-task.md` — where things stand
2. Read `exploration-cache/active-session/next-actions.md` — what to do first
3. Check `exploration-cache/active-session/blockers.md` — anything in the way
4. Check `docs/TASKS.md` for the authoritative sprint-by-sprint backlog
5. Run `git log --oneline -5` and `git status` on the actual repo
