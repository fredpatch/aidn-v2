# TEAM-FOUNDATION-1 Implementation Plan

**Goal:** Store and edit the dossier team proposal independently from the future final team.
**Architecture:** Four Drizzle tables, a dedicated staff-only API, and an isolated Preliminary card. Request and phase locks protect atomic membership replacement and its audit. Finalization has no command or route.
**Tech Stack:** PostgreSQL, Drizzle, Express, React Query, React, node:test, Vitest.
**Spec:** User-supplied TEAM-FOUNDATION-1 specification (42 sections).

## Global constraints

- Start at 62ba348, retain 06ea0bb. One focused commit, no amend, no push.
- Active dn_agent/dn_supervisor members only; SU alone is not eligible.
- Proposal writes: dn_supervisor/SU, existing open dossier and open M3.
- No CI/legal workflow, finalization action, workflow gate, portal change, or certificate migration.
- Proposed and final numbers remain distinct; maximum length 100, no global uniqueness.

## Review focus

- Concurrent saves must serialize and preserve matching header/members/audit.
- Failed audit or membership insert must roll back every proposal change.
- Existing inactive members must remain visible and removable in the editor.
- Closed dossier reads remain available, writes refused.
- Certificate field updates/generation remain independent of the proposed number.

## Task 1: Domain and API

- [x] Write DB/service and HTTP tests for the validation matrix, read shapes, RBAC, atomic failure, concurrency, cleanup, and certificate isolation; observe missing-module failures.
- [x] Add four tables to `apps/api/src/shared/db/schema.ts`; request/header cascades, membership uniqueness, user indexes, and nonblank approval checks.
- [x] Generate and inspect migration/snapshot/journal with `npm run db:generate --workspace=apps/api -- --name team_foundation_1`.
- [x] Add `modules/dossier-teams` types, input validation, service, controller, routes. Expose GET /requests/:id/team, PUT /requests/:id/team-proposal, GET /dossier-teams/eligible-members.
- [x] Save in one transaction: lock request, assert open, lock M3, validate active DN users, upsert proposal, replace members, audit, read response.
- [x] Add French activity labels and Delivery V2 reconciliation note. Run targeted API tests.

## Task 2: Preliminary card

- [x] Write tests for empty state, role matrix, French proposal wording, search/multiselect, save/refetch, validation failure, and closed dossier.
- [x] Add typed API functions and React Query keys; build `TeamProposalCard.tsx` and include it only for open M3 on `PreliminaryPhasePage.tsx`.
- [x] Show members, proposed number, update date; supervisor/SU edit an inline form with search, checkboxes, Save/Cancel. Agents read only. Never offer finalization.
- [x] Run card/page/activity tests.

## Task 3: Verification and delivery

- [x] Run full API suite serially, full admin suite, shared/API/admin typecheck, build, targeted ESLint, migration checks.
- [x] Obtain independent whole-change review, address findings, and repeat affected checks.
- [x] Record results/limitations and explicit scope exclusions; stage only task files; create one focused commit and report SHA. Do not push.

## Execution record

Tasks 1 and 2 complete. Task 3 validation and independent review complete:
API 950/950, admin 496/496; shared/API/admin typecheck, complete build,
targeted ESLint and both migration integrity checks pass. One review finding
(role-lock inversion) corrected and regression verified red/green. Details:
`docs/technical/team-foundation-1.md`. Delivered in one focused local commit;
no push or previous-commit amendment.
