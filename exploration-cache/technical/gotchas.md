# ⚠️ AIDN v2 - Known Pitfalls

Real bugs hit during Sprint 0/1/2, with exact symptoms and fixes, so nobody
rediscovers them the hard way.

## 1. `ignoreDeprecations: "6.0"` breaks typecheck on the installed TypeScript

**Symptom**: `tsc --noEmit` fails immediately with `TS5103: Invalid value for
'--ignoreDeprecations'`.
**Cause**: Copied verbatim from SICOT's `tsconfig.base.json`. SICOT's own
`quick-ref.md` even says "leave it alone" - but that's because SICOT's _installed_
TypeScript version differs from what resolves in AIDN's `npm install` (5.9.3 here,
via the `^5.4.5` range). The flag isn't valid on 5.9.3.
**Fix**: Removed entirely from `tsconfig.base.json`. Not needed - it was only there
to silence a `baseUrl` deprecation warning, which gotcha #2 fixes properly instead.

## 2. `baseUrl` deprecation warning in `apps/api` and frontend tsconfigs

**Symptom**: Editor warning "`baseUrl` is deprecated and will stop functioning in
TypeScript 7.0."
**Fix**: Removed `baseUrl` entirely; changed `"paths": { "@/*": ["*"] }` to
`"paths": { "@/*": ["./*"] }`. Modern TypeScript resolves non-relative `paths`
entries relative to the tsconfig file's own location once `baseUrl` is absent - but
the path value itself needs the leading `./`, or resolution silently fails.

## 3. `drizzle-kit@0.31.10`'s `migrate` CLI silently swallows real errors

**Symptom**: `npm run db:migrate` (when pointed at the raw `drizzle-kit migrate` CLI)
shows a spinner, then exits code 1 with **no error message at all** - not even in
verbose/debug output.
**Cause**: Confirmed upstream bug (drizzle-team/drizzle-orm#5601, #5816) - fixed in
the 1.0 beta line, never backported to 0.x.
**Fix**: `apps/api/src/scripts/migrate.ts` calls `drizzle-orm`'s `migrate()`
function directly (same underlying migrator, different entry point), which reports
the real error. `package.json`'s `db:migrate` script now runs this instead of the
CLI. This is how gotchas #4 and #5 below were actually diagnosed - the CLI gave
zero information.

## 4. Postgres: "unsafe use of new value" on a brand-new enum value

**Symptom**: Migration fails with
`error: unsafe use of new value "cancelled" of enum type request_status`,
`hint: New enum values must be committed before they can be used.`
**Cause**: A migration that both adds an enum value (`ALTER TYPE ... ADD VALUE`) and
references that same value (e.g. in a partial index's `WHERE` clause) in the _same
transaction_ is rejected by Postgres - the new value isn't visible until the adding
transaction commits.
**Fix** (pre-production, no real data): drop and recreate the database, delete
`apps/api/drizzle/`, regenerate a single fresh migration that creates the enum with
all its values from the start (`CREATE TYPE` includes every value at once - this
rule only bites `ALTER TYPE ADD VALUE` on an _existing_ type). **If this recurs with
real data already migrated**, a two-step migration (add the value, commit, then use
it in a later migration) will be needed instead - collapsing migrations won't be an
option anymore.

## 5. Postgres: "schema public does not exist"

**Symptom**: Migration fails with `error: schema "public" does not exist`.
**Cause**: Unclear root cause - the `public` schema exists by default in a fresh
Postgres database; this database had gotten into an odd state after repeated
drop/recreate cycles.
**Fix**: `CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres, public;`
run once against the affected database before migrating.

## 6. Uploads endpoint had zero authentication

**Symptom**: `POST /api/uploads` accepted files from completely unauthenticated
requests, despite a code comment claiming "authentication is enforced by the
mounting context" - that enforcement was never actually written.
**Found by**: Actually testing an unauthenticated `curl` call, not by reading the
code.
**Fix**: `authenticateEither` middleware added directly on the route.

## 7. Applicant auth didn't exist at all - Sprint 1 was "tested" with a staff token

**Symptom**: No actual bug report - a design gap. The requests module was verified
working by logging in as the SU staff account and using that token to simulate a
portal submission.
**Fix**: Built genuine applicant auth (`modules/applicant-auth/`) - separate
`applicants` table, email+password login, separate JWT payload shape with a
`kind: "applicant"` discriminator so it can never be accepted where a staff token
is expected. See `project/decisions.md` #5.

## 8. Drizzle wraps Postgres errors - `error.code` is actually `error.cause.code`

**Symptom**: A unique-constraint violation (Postgres code `23505`, used to detect
"one active demande" conflicts) was falling through to a generic `500 Internal
Server Error` instead of the intended `409 REQUEST_ALREADY_ACTIVE`.
**Cause**: Drizzle wraps the underlying `pg` error in a `DrizzleQueryError`; the
real Postgres error code lives at `error.cause.code`, not `error.code` directly.
**Fix**: `isUniqueViolation()` in `requests.service.ts` checks both
`error.code` and `error.cause?.code`.

## 9. `@aidn/shared` types don't resolve until it's built once

**Symptom**: `tsc` (or Vite) fails with "Cannot find module '@aidn/shared' or its
corresponding type declarations" even though the workspace link exists.
**Cause**: `packages/shared/package.json`'s `main`/`types` point at `./dist/...`,
which doesn't exist until `tsc -p tsconfig.json` runs once for that package.
**Fix**: Root `package.json` now has a `postinstall` script that builds
`packages/shared` automatically after every `npm install`.

## 10. `lib/api.ts` → `lib/axios.ts` rename done for admin, forgotten for portal

**Symptom**: `apps/portal/src/pages/auth/LoginPage.tsx` and `apps/portal/src/pages/
requests/MyRequestPage.tsx` import `from '../../lib/axios'`, but
`apps/portal/src/lib/axios.ts` was never created - only the admin app got one. Portal
will fail to resolve the module.
**Cause**: A global find/replace (or copy-paste-driven edit) updated the import
_paths_ in both apps consistently, but only the admin app actually got the new file
written. The archived `docs/*.diff` reference files were regenerated and confirm the
intent was portal-wide.
**Fix**: Created `apps/portal/src/lib/axios.ts` mirroring the admin version (pointed
at `/applicant-auth/refresh`), switched `useApplicantAuth.tsx` over to it, deleted
both apps' now-orphaned `lib/api.ts`. See `project/decisions.md` #10. Before trusting
any "lib/api → lib/axios" rename again, grep both apps for the old import path, not
just one.

## 11. Admin's `useAuth.tsx` imported from a doubled `@/src/lib/axios` path

**Symptom**: `apps/admin/src/hooks/useAuth.tsx` imported `{ api } from '@/src/lib/
axios'` - a doubled `src/src` segment (the `@` alias already resolves to `apps/admin/
src`), so the module never resolved. This broke the _admin_ build too, not just the
portal one documented in #10 - found while investigating the same axios-hardening
migration.
**Cause**: Manual edit combined the `@/` alias convention with a relative `src/lib/
axios` path left over from copy-pasting, doubling the segment.
**Fix**: Changed to the plain relative import `'../lib/axios'`, consistent with how
every other hook in the codebase imports from `lib/`.

## 12. `sessionStorage` key for "session expired" was French on write, English on read (admin); missing entirely (portal)

**Symptom**: Admin's `LoginPage.tsx` read `sessionStorage.getItem('session_expiree')`
(French) but `lib/axios.ts`'s refresh-failure redirect wrote `session_expired`
(English) - the two never matched, so the "votre session a expiré" message never
appeared after a forced re-login. Portal's `LoginPage.tsx` had no such check at all,
even though its `lib/axios.ts` (see #10) sets the same flag on refresh failure.
**Fix**: Standardized on the English key `session_expired` everywhere (matches
`technical/conventions.md`'s English-code/French-UI split - the key is code, the
message it triggers is French). Fixed the read side in admin's `LoginPage.tsx` and
added the matching read+clear `useEffect` to portal's `LoginPage.tsx`.

## 13. `.prettierrc` already specified `singleQuote: true` but wasn't consistently applied

**Symptom**: Most of `apps/admin`/`apps/portal` source still used double-quoted
strings and un-wrapped long lines despite a repo-root `.prettierrc` with
`"singleQuote": true"` present since Sprint 0.
**Cause**: `npx prettier --write` (or the editor's format-on-save) was never actually
run across the frontend apps after the initial scaffold - the config existed but
nothing enforced it.
**Fix**: Reformatted this session across `AppShell.tsx`, `useAuth.tsx`, `lib/api.ts`,
`BootstrapPage.tsx`, both `LoginPage.tsx` files, `RequestsPage.tsx`, `UsersPage.tsx`,
`MyRequestPage.tsx`. Worth running `npx prettier --check .` in CI once a CI pipeline
exists, so this doesn't silently drift again.

## 14. tsconfig files got mixed up during a manual local edit

**Symptom**: `apps/admin/tsconfig.json` ended up with `apps/api`'s
`outDir`/`rootDir` fields instead of its own `target`/`jsx`/`moduleResolution`
fields (and vice versa risk for `apps/api`).
**Cause**: Manual copy-paste error while applying an earlier fix by hand.
**Fix**: Direct file replacement of both files with correct content, verified with
a full `npm install` + typecheck + build afterward - don't assume a "fix applied"
message means the fix is actually correct; re-verify.

## 15. Controllers crash on an empty request body

**Symptom**: `TypeError: Cannot destructure property 'x' of 'req.body' as it is
undefined` - a clean `400` was expected, a `500` happened instead.
**Cause**: When a request has no body and no `Content-Type` header,
`express.json()` leaves `req.body` as `undefined` rather than `{}`. Every
controller in the app (Sprint 1 _and_ Sprint 2) destructured `req.body`
directly, assuming it was always at least an empty object.
**Fix**: Every controller now destructures `req.body ?? {}`. Systemic fix
applied across `auth`, `users`, `requests`, `applicant-auth`, `bootstrap`,
`phases`, `meetings`, `document-templates`, `preliminary-evaluation` - not
just the newly-written Sprint 2 code. Found by deliberately testing an
endpoint with no body at all, not by reading the code.

## 16. Router-wide middleware silently intercepts unrelated routes

**Symptom**: An applicant calling `GET /api/phases/1/preliminary-evaluation`
got `401 Non authentifie` even with a valid applicant session.
**Cause**: `phases.route.ts` applies `router.use(authenticate,
requireRole(...))` with no path restriction, gating _everything_ mounted
under `/api/phases`. `preliminary-evaluation.route.ts`'s paths originally
started with `/phases/:phaseId/...`, so when mounted, Express matched the
`/api/phases` prefix first and ran the staff-only gate before the request
ever reached the intended (applicant-accessible) route.
**Fix**: Moved `preliminary-evaluation` to its own mount prefix
(`/api/preliminary-evaluation`), with paths that share no prefix with any
other router. **General rule going forward**: never give a router a
blanket `router.use(authenticate, ...)` if another router's routes might
ever be nested under its mount path - scope the auth middleware per-route
instead, or keep mount prefixes strictly non-overlapping.

## 17. Check ordering matters for error clarity, not just correctness

**Symptom**: Opening an already-open phase a second time returned
`REQUEST_NOT_READY_FOR_PHASE` (technically true - the request had already
moved to `in_progress` - but a confusing message for what's actually a
double-open attempt).
**Fix**: Reordered `openPreliminaryPhase()` to check for an existing phase
_before_ checking the request's status, surfacing the more specific
`PHASE_ALREADY_OPEN` error. Both checks were always correct; only the
order affected which error the caller actually sees.

## 18. `packages/shared` drifted from the schema it's supposed to mirror

**Symptom**: none yet observed, but a landmine - `MEETING_STATUSES` in
`packages/shared/src/statuses.ts` was missing `"scheduled"`, even though
that's the schema's actual default/initial status for every meeting row.
**Cause**: The shared constant was written once during Sprint 1 scaffolding
and never re-synced when the schema's default was decided.
**Fix**: Added `"scheduled"` to `MEETING_STATUSES`. **No general fix for the
underlying risk yet** - there's no automated check that `packages/shared`'s
enums match `schema.ts`'s `pgEnum` definitions; worth a lint rule or test
once there's time to build one.

## 19. `authenticateEither` could let a stale staff cookie win over a genuine applicant request

**Symptom**: No incident reported, but a real design gap found while building
Sprint 2's applicant-facing endpoints - admin and portal run on the same top-level
domain (differ only by port in dev, and possibly by subdomain on-prem), so browser
cookies aren't isolated between them the way a true cross-domain setup would isolate
them. If a browser happened to carry both an admin session cookie and an applicant
session cookie (e.g. the same machine used for both), `authenticateEither`'s
staff-first check meant a stale staff session would silently win even when the
caller was genuinely the portal.
**Fix**: `authenticateEither` (`apps/api/src/shared/guards/auth.middleware.ts`) now
reads the standard `Origin` header (sent by the browser on every fetch/XHR call, no
frontend change needed) and checks the _matching_ cookie first - applicant cookie
first if `Origin` matches `PORTAL_ORIGIN`, staff cookie first otherwise - falling
back to the other cookie only if the preferred one is absent or invalid. Requests
with no recognized `Origin` (server-to-server, curl, Postman) keep the previous
staff-first behaviour. New env var `PORTAL_ORIGIN` required for this to work in
non-dev environments - confirm it's set alongside the others in `.env`.
**Superseded (BUG-PORTAL-INTAKE-1, 2026-10-16)**: the fallback itself was the bug - an expired applicant token on a
portal call fell through to the staff session. The app (Origin, else the origin of Referer, matched against
`PORTAL_ORIGIN` / `ADMIN_ORIGIN`) is now authoritative: portal -> applicant only, admin -> staff only, no fallback;
unknown app -> the single valid session, both valid -> 401 `AMBIGUOUS_SESSION`. Referer matters because browsers send
no Origin on same-origin GETs, and both apps reach the API through a same-origin proxy (Vite in dev, nginx in staging).

## 20. `requireApplicant` and `requireApplicantOrRole` are mutually exclusive, not stackable

**Symptom** (M4-START-AUTH-1): DN opening the M4 workspace right after M3 closed
got `"Accès réservé au portail postulant."` instead of the "Démarrer la Phase"
button, even though the backend's open-phase logic and the admin UI's empty-state
were both already correct.
**Cause**: `formal-request.route.ts`'s shared bundle GET and formal-letter POST
stacked `requireApplicant, requireApplicantOrRole(dn_agent, dn_supervisor, SU)` on
the same route. `requireApplicant` (`apps/api/src/shared/guards/auth.middleware.ts`)
is documented for "portal-only write actions" and unconditionally 403s/short-circuits
any request where `req.applicant` is unset - i.e. every staff session - before
`requireApplicantOrRole` ever runs. The two middlewares are mutually exclusive
gates: `requireApplicant` already filters out everyone but applicants, so a role
list passed to `requireApplicantOrRole` placed after it is dead code for staff.
**Fix**: use `requireApplicantOrRole(...)` alone after `authenticateEither` for any
route meant to be shared between applicant and staff - this is the pattern M3, M5,
M6, M7 and meetings already use correctly. `requireApplicant` is only correct when
used by itself, for a route that must truly be applicant-only.
**Residual risk**: the same route file documented (in code comments) staff-on-behalf
access on 4 sibling "proof of payment"/"resubmit" routes in M5/M6/M7 that use
`requireApplicant` alone with no `requireApplicantOrRole` fallback at all - so those
comments may be aspirational rather than implemented. Flagged, not yet fixed -
needs its own audit before touching, since later hardening may have deliberately
made those applicant-only.

## 21. A request can have several `dg_circuit_documents` rows: always filter by `entity_type`

**Symptom**: a view or mutation silently acts on the wrong circuit (the M4 letter, the M3 declaration or, since
SESSION1-M1-1, the Directeur DN circuit) because it selected circuits `WHERE request_id = ?` or built
`new Map(rows.map(r => [r.requestId, r]))` - last row wins.

**Cause**: the unique index is `(entity_type, request_id)`: one row per type, up to four per dossier.

**Fix / rule**: every reader filters by the entity type it means (`intake_request`, or `RECEPTION_CIRCUIT_ENTITY_TYPES`
for the Réception-owned views). New entity types need an explicit storage mapping (`storage-context.ts` falls back
to M4) and, if their files are internal, a file-access stage (`file-context.ts`).

## 22. DB-backed API tests: use a disposable database, serially

`npm test` skips `*.db.test.ts` without `DATABASE_URL`. Point it at a throwaway database (migrated with
`db:migrate`), never the dev one. `K7 closed dossier is read-only` snapshots whole tables (`audit_logs`,
`dg_circuit_documents`, `document_versions`...), so it can fail when other DB test files write at the same time:
run `npx tsx --test --test-concurrency=1 "src/**/*.test.ts"`. On Windows, `K8b one certificate per request` fails
with `spawn npx ENOENT` (it spawns `npx` without a shell) - environmental, not a regression.

## 23. A new enum value cannot be used by a later migration: drizzle applies all pending migrations in ONE transaction

**Symptom**: `npm run db:migrate` fails with PostgreSQL `55P04` ("unsafe use of new value ... of enum type") on a migration that INSERTs/UPDATEs with the value added by an earlier pending migration. It only fails when rows match, so an empty throwaway DB passes.

**Cause**: `drizzle-orm` `migrate()` wraps every pending migration in a single transaction; PostgreSQL requires the enum value to be committed first. Splitting into two migration files does not help.

**Fix / rule**: a migration may `ADD VALUE`; data that uses it runs afterwards from an explicit idempotent script (example: `db:backfill:dn-annotation`, SESSION1-M1-1). `dn-annotation.migrations.test.ts` guards this for `dn_director_annotation`. Test migrations on a DB that is *behind* the new migration and holds legacy rows.

## 24. Role writes must be atomic ("Accès refusé" for a role-less account)

Creating a user then inserting roles, or deleting roles then inserting the new ones, used to be separate statements. If the role insert failed (for example an enum value whose migration was not applied yet), the account was left with NO role and landed on "Accès refusé". `createUser`, `updateUser` and `updateUserRoles` now run in a transaction (`users.roles.db.test.ts`). After pulling a new role, run `db:migrate` before assigning it.

## 25. Raw `pg` reads of `timestamp` columns come back in the machine's zone

**Symptom**: a DB test compares a slot written through the app (`new Date(...)`) with the same column read through a
raw `pg.Pool` and is off by exactly one hour - only for dates on the other side of a DST change (SESSION1-MEET-1).

**Cause**: our columns are `timestamp` without time zone holding UTC (drizzle convention). `pg`'s default parser for
type 1114 interprets that text as LOCAL time.

**Fix / rule**: in DB tests reading timestamps with a raw pool, pass a `types.getTypeParser` that parses 1114 as UTC
(see `meeting-negotiation.db.test.ts`), or compare through the app's services. App-side raw SQL already uses
`utcTimestamp()` (requests.service.ts).

## 26. Local `apps/api/.env` must define `PORTAL_ORIGIN` and `ADMIN_ORIGIN`

**Symptom**: submitting a demande from the portal answers « applicantId requis pour une saisie manuelle. » (or another
staff-only message) - only when the same browser is also logged into the admin (2026-10-15).

**Cause**: both apps run on `localhost`, and cookies are not port-scoped, so the browser sends the staff AND the
applicant session to the API. `authenticateEither` prefers the applicant session only when `Origin` equals
`PORTAL_ORIGIN`; without it the staff session wins and the portal call is handled as a reception manual entry.

**Fix / rule**: keep `PORTAL_ORIGIN=http://localhost:5174` and `ADMIN_ORIGIN=http://localhost:5173` in the local
`.env` (they are in `.env.example`); restart the API after editing `.env`. The expired-token residual is fixed by
BUG-PORTAL-INTAKE-1 (gotchas #19): a portal call never falls back to the staff session. Without the two variables
every request is "unknown app", so a browser holding both sessions now gets 401 `AMBIGUOUS_SESSION` instead of the
wrong identity.

## 27. `defaultNow()` columns follow the PostgreSQL session time zone

**Symptom**: inside one transaction, `audit_logs.created_at` and `payments.validated_at` differed by exactly 120 min
on a local database (ROLE-ANALYTICS-1A, 2026-10-16). Same for every `defaultNow()` column (`phases.opened_at`,
`dg_circuit_documents.deposited_at`, `site_inspections.submitted_at`, `created_at` columns...).

**Cause**: columns are `timestamp` without time zone holding UTC. App-written values (`new Date()`) are UTC, but a
`DEFAULT now()` is converted to the *session* time zone, which defaults to the server's (`Europe/Paris` on the dev
machine; `postgres:16-alpine` defaults to UTC, but nothing pinned it).

**Fix / rule** (ROLE-ANALYTICS-1B): every app pool and script connects through `pgConnectionConfig()`
(`apps/api/src/shared/db/connection.ts`), which adds the start-up option `-c TimeZone=UTC` (after any `PGOPTIONS`).
New pools must use it. A `DATABASE_URL` carrying `?options=` would override it. Historical rows written before the pin
on a non-UTC server keep their offset (dev/test: accepted; no data rewrite).

**Deployment check** (staging / production, not verified from the dev environment):

```sql
SHOW TimeZone;                                   -- server default; the app session forces UTC anyway
SELECT now(), now() AT TIME ZONE 'UTC', localtimestamp;
-- Representative comparison: an app-written column against its audit row (written in the same transaction).
SELECT p.validated_at, a.created_at, a.created_at - p.validated_at AS drift
FROM payments p JOIN audit_logs a ON a.entity_id = p.id AND a.action = 'PAYMENT_VALIDATED'
WHERE p.validated_at IS NOT NULL ORDER BY a.id DESC LIMIT 5;
```

A drift of whole hours on rows written before the deployment means that environment's history is offset; decide
any correction separately (never in place without a backup).
