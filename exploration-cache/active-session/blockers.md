# Active Blockers

Last updated: 2026-10-08

No runtime hard blocker is known for the K4 payment-decision batch.

## Active Risks

### R1 - K5 validation gap remains

**Impact**: K4 fixed module isolation for rejection, but `validatePayment` still needs the same phase-module check. The known worst case is an M7 validation endpoint validating an M5 payment and entering the certificate path.

**Current workaround**: Treat K5 as the next API hardening batch before relying on cross-module payment endpoint isolation.

**Waiting on**: K5 implementation and tests.

### R2 - M7 validation and certificate creation are not one transaction yet

**Impact**: K4 prevents a certificate after a lost validation race, but payment validation and certificate creation still need to be made fully atomic.

**Current workaround**: Keep this visible in K5; do not expand payment flows before closing it.

**Waiting on**: K5 implementation and real PostgreSQL regression tests.

### R3 - Frontend-agent branch is not merge-ready

**Impact**: `chore/codex-frontend-agents` contains useful frontend documentation, table migrations, and large-component decomposition work, but it is behind current `main`. A direct merge/diff would risk removing current staging infrastructure and latest Drizzle migration files.

**Current workaround**: Do not merge directly. Rebase/cherry-pick scoped groups or replay selected refactors on top of current `main`.

**Waiting on**: Decision on whether to preserve the full branch, cherry-pick selected commits, or redo the useful parts from current `main`.

## Soft Blockers

### S1 - Full API tests depend on runtime/database context

**Impact**: K4's strongest coverage uses a real PostgreSQL database and skips without `DATABASE_URL`. The generic API test command can therefore pass with those tests skipped in environments without a disposable DB.

**Current workaround**: Run the DB-backed K4 suite against a migrated disposable database before production rollout.

### S2 - Notion backlog status drift

**Impact**: Notion may still list already-built items as not started.

**Current workaround**: Treat repo/cache/Git history as technical source of truth and reconcile Notion after code batches land.

### S3 - Vite large-chunk warnings

**Impact**: Admin/portal builds can pass with large bundle warnings. This is not blocking dev, but it should be handled before production hardening.

**Current workaround**: Track as later bundle-size/code-splitting task.
