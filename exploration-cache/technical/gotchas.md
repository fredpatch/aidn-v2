# ⚠️ AIDN v2 — Known Pitfalls

Real bugs hit during Sprint 0/1, with exact symptoms and fixes, so nobody rediscovers
them the hard way.

## 1. `ignoreDeprecations: "6.0"` breaks typecheck on the installed TypeScript

**Symptom**: `tsc --noEmit` fails immediately with `TS5103: Invalid value for
'--ignoreDeprecations'`.
**Cause**: Copied verbatim from SICOT's `tsconfig.base.json`. SICOT's own
`quick-ref.md` even says "leave it alone" — but that's because SICOT's *installed*
TypeScript version differs from what resolves in AIDN's `npm install` (5.9.3 here,
via the `^5.4.5` range). The flag isn't valid on 5.9.3.
**Fix**: Removed entirely from `tsconfig.base.json`. Not needed — it was only there
to silence a `baseUrl` deprecation warning, which gotcha #2 fixes properly instead.

## 2. `baseUrl` deprecation warning in `apps/api` and frontend tsconfigs

**Symptom**: Editor warning "`baseUrl` is deprecated and will stop functioning in
TypeScript 7.0."
**Fix**: Removed `baseUrl` entirely; changed `"paths": { "@/*": ["*"] }` to
`"paths": { "@/*": ["./*"] }`. Modern TypeScript resolves non-relative `paths`
entries relative to the tsconfig file's own location once `baseUrl` is absent — but
the path value itself needs the leading `./`, or resolution silently fails.

## 3. `drizzle-kit@0.31.10`'s `migrate` CLI silently swallows real errors

**Symptom**: `npm run db:migrate` (when pointed at the raw `drizzle-kit migrate` CLI)
shows a spinner, then exits code 1 with **no error message at all** — not even in
verbose/debug output.
**Cause**: Confirmed upstream bug (drizzle-team/drizzle-orm#5601, #5816) — fixed in
the 1.0 beta line, never backported to 0.x.
**Fix**: `apps/api/src/scripts/migrate.ts` calls `drizzle-orm`'s `migrate()`
function directly (same underlying migrator, different entry point), which reports
the real error. `package.json`'s `db:migrate` script now runs this instead of the
CLI. This is how gotchas #4 and #5 below were actually diagnosed — the CLI gave
zero information.

## 4. Postgres: "unsafe use of new value" on a brand-new enum value

**Symptom**: Migration fails with
`error: unsafe use of new value "cancelled" of enum type request_status`,
`hint: New enum values must be committed before they can be used.`
**Cause**: A migration that both adds an enum value (`ALTER TYPE ... ADD VALUE`) and
references that same value (e.g. in a partial index's `WHERE` clause) in the *same
transaction* is rejected by Postgres — the new value isn't visible until the adding
transaction commits.
**Fix** (pre-production, no real data): drop and recreate the database, delete
`apps/api/drizzle/`, regenerate a single fresh migration that creates the enum with
all its values from the start (`CREATE TYPE` includes every value at once — this
rule only bites `ALTER TYPE ADD VALUE` on an *existing* type). **If this recurs with
real data already migrated**, a two-step migration (add the value, commit, then use
it in a later migration) will be needed instead — collapsing migrations won't be an
option anymore.

## 5. Postgres: "schema public does not exist"

**Symptom**: Migration fails with `error: schema "public" does not exist`.
**Cause**: Unclear root cause — the `public` schema exists by default in a fresh
Postgres database; this database had gotten into an odd state after repeated
drop/recreate cycles.
**Fix**: `CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres, public;`
run once against the affected database before migrating.

## 6. Uploads endpoint had zero authentication

**Symptom**: `POST /api/uploads` accepted files from completely unauthenticated
requests, despite a code comment claiming "authentication is enforced by the
mounting context" — that enforcement was never actually written.
**Found by**: Actually testing an unauthenticated `curl` call, not by reading the
code.
**Fix**: `authenticateEither` middleware added directly on the route.

## 7. Applicant auth didn't exist at all — Sprint 1 was "tested" with a staff token

**Symptom**: No actual bug report — a design gap. The requests module was verified
working by logging in as the SU staff account and using that token to simulate a
portal submission.
**Fix**: Built genuine applicant auth (`modules/applicant-auth/`) — separate
`applicants` table, email+password login, separate JWT payload shape with a
`kind: "applicant"` discriminator so it can never be accepted where a staff token
is expected. See `project/decisions.md` #5.

## 8. Drizzle wraps Postgres errors — `error.code` is actually `error.cause.code`

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

## 11. `lib/api.ts` → `lib/axios.ts` rename done for admin, forgotten for portal

**Symptom**: `apps/portal/src/pages/auth/LoginPage.tsx` and `apps/portal/src/pages/
requests/MyRequestPage.tsx` import `from '../../lib/axios'`, but
`apps/portal/src/lib/axios.ts` was never created — only the admin app got one. Portal
will fail to resolve the module.
**Cause**: A global find/replace (or copy-paste-driven edit) updated the import
*paths* in both apps consistently, but only the admin app actually got the new file
written. The archived `docs/*.diff` reference files were regenerated and confirm the
intent was portal-wide.
**Fix**: Not yet applied — see `active-session/blockers.md` #B0 and
`project/decisions.md` #10. Before trusting any "lib/api → lib/axios" rename again,
grep both apps for the old import path, not just one.

## 12. `.prettierrc` already specified `singleQuote: true` but wasn't consistently applied

**Symptom**: Most of `apps/admin`/`apps/portal` source still used double-quoted
strings and un-wrapped long lines despite a repo-root `.prettierrc` with
`"singleQuote": true"` present since Sprint 0.
**Cause**: `npx prettier --write` (or the editor's format-on-save) was never actually
run across the frontend apps after the initial scaffold — the config existed but
nothing enforced it.
**Fix**: Reformatted this session across `AppShell.tsx`, `useAuth.tsx`, `lib/api.ts`,
`BootstrapPage.tsx`, both `LoginPage.tsx` files, `RequestsPage.tsx`, `UsersPage.tsx`,
`MyRequestPage.tsx`. Worth running `npx prettier --check .` in CI once a CI pipeline
exists, so this doesn't silently drift again.

## 13. tsconfig files got mixed up during a manual local edit

**Symptom**: `apps/admin/tsconfig.json` ended up with `apps/api`'s
`outDir`/`rootDir` fields instead of its own `target`/`jsx`/`moduleResolution`
fields (and vice versa risk for `apps/api`).
**Cause**: Manual copy-paste error while applying an earlier fix by hand.
**Fix**: Direct file replacement of both files with correct content, verified with
a full `npm install` + typecheck + build afterward — don't assume a "fix applied"
message means the fix is actually correct; re-verify.
