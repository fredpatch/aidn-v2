# 🔴 Active Blockers

Last updated: 2026-07-07

## 🔴 Hard Blockers (breaks the build/run today)

### B0 — `apps/portal/src/lib/axios.ts` referenced but never created

**Impact**: `apps/portal/src/pages/auth/LoginPage.tsx` and
`apps/portal/src/pages/requests/MyRequestPage.tsx` now `import { api, apiErrorMessage }
from '../../lib/axios'` — but only `apps/admin/src/lib/axios.ts` was actually created
this session. `apps/portal/src/lib/axios.ts` does not exist. The portal app will fail
to resolve this module (Vite dev server / build will error).
**Cause**: The admin app's naive `lib/api.ts` (a single shared `refreshing` promise) was
replaced with a hardened `lib/axios.ts` that queues concurrent 401s properly instead of
racing them — see `project/decisions.md` #10. The portal app's imports were updated to
match (`docs/aidn-v2-redesign.diff` / `aidn-v2-sprint1-ui.diff` were regenerated with
`lib/axios` throughout, confirming the *intent* was portal-wide), but the portal
equivalent file was never written, and `apps/portal/src/hooks/useApplicantAuth.tsx`
still imports the old `apps/portal/src/lib/api.ts` — so the migration is half-done.
**Fix needed**: Create `apps/portal/src/lib/axios.ts` mirroring
`apps/admin/src/lib/axios.ts`'s queued-refresh logic, but pointed at
`/applicant-auth/refresh` (not `/auth/refresh`) and without the `/login` redirect
literal being staff-specific. Then decide whether to delete the now-orphaned
`apps/admin/src/lib/api.ts` and `apps/portal/src/lib/api.ts`, or keep the old ones
around for anything still referencing them (currently just
`useApplicantAuth.tsx`).
**Status**: Not yet fixed — flagged mid-session, left for the next diff since this is
uncommitted work in progress.

---

## 🟡 Soft Blockers (work around them for now)

### B1 — M13 applicant account creation not built

**Impact**: The portal's login screen only works for applicants that already exist
in the database. There's no self-registration flow yet (that's the anti-bot,
organisation-dedup flow from `project/modules-feasibility.md` M13, scheduled for
Sprint 12).
**Current workaround**: Manually insert a test organisation + applicant row (with a
real bcrypt password hash) directly via SQL for testing/demo purposes.
**Waiting on**: Nothing external — just sprint sequencing. Could be pulled forward
if this becomes a recurring friction point before Sprint 12.

### B2 — No visual/browser verification of the UI

**Impact**: Claude's sandbox has no browser rendering capability. All frontend work
this session was verified via typecheck + production build + dev-server-boot +
`curl`-based API flow tests — never an actual rendered screenshot.
**Current workaround**: Fred verifies visually on his own machine after each UI diff.
**Waiting on**: N/A — inherent tooling limitation, not something to "resolve," just
something to remember when a UI diff is handed over.

---

## 🟢 Resolved Blockers (History)

| Blocker | Resolved | How |
|---|---|---|
| `drizzle-kit migrate` CLI hangs/fails with zero error output | 2026-07-07 | Found the bug is a confirmed upstream drizzle-kit 0.31.10 issue; wrote `scripts/migrate.ts` calling `drizzle-orm`'s `migrate()` directly instead |
| Postgres enum transaction error (`unsafe use of new value`) | 2026-07-07 | Collapsed to one fresh migration (pre-production, no data to preserve) |
| Postgres `schema "public" does not exist` | 2026-07-07 | `CREATE SCHEMA public` run once against the affected DB |
| `tsc --noEmit` broken via `ignoreDeprecations` copied from SICOT | 2026-07-07 | Removed the flag entirely; fixed the underlying `baseUrl` deprecation properly instead |
| Uploads endpoint had no authentication | 2026-07-07 | `authenticateEither` middleware added |
| Applicant auth didn't exist (Sprint 1 "tested" with a staff token) | 2026-07-07 | Built `modules/applicant-auth/` with a `kind`-discriminated JWT |
| UI/UX only matched SICOT's colors, not its structure | 2026-07-07 | Rebuilt Bootstrap/Login/Layout with the same component/animation system |
