# ROLE-ANALYTICS-1B Implementation Plan

**Goal:** UTC-pinned DB sessions, Libreville periods, audit-event catalogue, shared analytics helpers, parameterised SLA + B1 in `/overview`, and the role-analytics contract/route foundation.

**Spec:** `docs/superpowers/specs/2026-10-16-role-analytics-1b-design.md`

**Execution:** native (inline), one whole-feature review before the single commit.

## Global Constraints

- No migration, no UI, no KPI provider, no fabricated metric values.
- New API: semantic keys only; errors use the existing `createErrorHandler` pattern.
- No server-local date arithmetic in new code (`Date.UTC` only).
- `/analytics/overview` stays `dn_supervisor` + `SU`; its response shape is unchanged (reports).
- DB tests: `DATABASE_URL=postgresql://postgres:admin@localhost:5432/aidn_v2_meet2_test`, skip without it, clean up their rows.

## Tasks

1. **UTC sessions** — `shared/db/connection.ts` (`pgConnectionConfig`), used by `shared/db/index.ts` and the six scripts. Test `db-session-timezone.db.test.ts`: with `PGOPTIONS=-c TimeZone=Pacific/Kiritimati` set before importing the app pool, `SHOW TimeZone` is `UTC` and an `audit_logs.created_at` default is within 5 s of the app's `new Date()`; a raw pool with the same `PGOPTIONS` (control) shows the drift, proving the test can fail.
2. **Periods** — `modules/analytics/period.ts` + `period.test.ts` (today, month/year boundary, leap year, custom single/multi-day, invalid inputs, >366 days, result identical under `TZ` changes via a child process).
3. **Event catalogue** — `modules/analytics/audit-events.ts` + test (current actions present as string literals in `modules/**` non-test sources, legacy absent, no overlap, all in `AUDIT_ENTITY_BY_ACTION`).
4. **Helpers** — `modules/analytics/metrics.ts` + `metrics.test.ts`; service imports them.
5. **SLA params + B1** — `THRESHOLD_KEYS` phase keys; `getAnalyticsOverview` via `loadThresholds`; closed dossiers out of current blockers. DB test `overview-sla-b1.db.test.ts` (parameter changes reflected; rejected/cancelled/completed/active).
6. **Contract + route** — `packages/shared/src/role-analytics.ts`; `analytics.route.ts` per-route guards; `role-analytics.controller.ts`, `role-analytics.service.ts` (provider registry, dispatch); error codes in `error.ts`. HTTP test `role-analytics.http.test.ts` (matrix, multi-role, invalid domain/scope/period, 501, `/overview` 200/403) + dispatch unit test with a fake provider.
7. **Docs** — gotcha #27 (DB time zone + checks), decisions #23, changelog, current-task.
8. **Validation + review + commit.**
