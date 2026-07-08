# 🔴 Active Blockers

Last updated: 2026-07-08

No active hard blockers. Sprint 2 (Phase Préliminaire, M3) is fully built and
typechecks clean across all three workspaces, uncommitted and ready to push — see
`active-session/current-task.md`.

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
| Portal *and* admin builds both broken (incomplete axios-hardening migration: missing `portal/lib/axios.ts`, a doubled-`src` broken import in admin's `useAuth.tsx`, and a French/English sessionStorage key mismatch) | 2026-07-07 | Created portal's `lib/axios.ts` mirroring admin's, fixed the broken import path, standardized the key on English `session_expired`, deleted both apps' now-orphaned `lib/api.ts` |
