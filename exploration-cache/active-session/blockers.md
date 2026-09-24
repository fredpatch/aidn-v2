# Active Blockers

Last updated: 2026-09-24

No runtime hard blocker is known on current `main`. The current blockers are reconciliation and sequencing issues before new feature development.

## Active Reconciliation Risks

### B1 - Frontend-agent branch is not merge-ready

**Impact**: `chore/codex-frontend-agents` contains useful frontend documentation, table migrations, and large-component decomposition work, but it is behind current `main`. A direct merge/diff would risk removing current staging infrastructure and latest Drizzle migration files.

**Current workaround**: Do not merge directly. Rebase/cherry-pick scoped groups or replay selected refactors on top of current `main`.

**Waiting on**: Decision on whether to preserve the full branch, cherry-pick selected commits, or redo the useful parts from current `main`.

### B2 - Notion backlog status drift

**Impact**: The active Notion backlog still lists some already-built items as `Not started`, especially older M3 items and report generation/export items. This can mislead planning if read without repo/cache context.

**Current workaround**: Treat the repo tree and current Git history as technical source of truth. Use Notion for shared high-level planning after status cleanup.

**Waiting on**: Update stale Notion backlog rows during documentation reconciliation.

## Soft Blockers

### S1 - M13 applicant account/self-registration polish remains separate

**Impact**: Applicant account creation/self-registration, anti-bot flow, and deeper organisation dedup remain a later product area. Existing applicant/account-request surfaces should not be mistaken for the full M13 polish scope unless verified.

**Current workaround**: Use existing seeded/test applicants or existing account-request flow where available. Keep M13 scoped separately.

### S2 - Browser/visual verification is manual

**Impact**: CLI validation can prove type/build health, but final cockpit/document-viewer ergonomics still need Fred's browser verification.

**Current workaround**: Run typecheck/build locally, then do the final role replay in the browser on Fred's machine.

### S3 - Vite large-chunk warnings

**Impact**: Admin/portal builds can pass with large bundle warnings. This is not blocking dev, but it should be handled before production hardening.

**Current workaround**: Track as later bundle-size/code-splitting task.

## Resolved Historical Blockers

- Drizzle CLI migration issue: resolved by using the project migration script instead of raw `drizzle-kit migrate`.
- Staff/applicant token confusion: resolved with `kind`-discriminated auth and origin-aware cookie selection.
- Empty request body crashes: resolved by using `req.body ?? {}` patterns.
- Applicant visibility leak for R3 inspection verdict: resolved server-side.
- M4/M5 cache drift from July: superseded by current repo/cache reconciliation.
