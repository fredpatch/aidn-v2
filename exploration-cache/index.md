# AIDN v2 - Exploration Cache Index

This folder is the living technical memory for AIDN v2. Notion is the shared high-level project dashboard; this cache is the repo-adjacent handoff for engineering state, decisions, gotchas, and next actions.

**Project**: AIDN - Application Informatique de la Direction de la Navigabilite - ANAC Gabon
**Last updated**: 2026-09-24
**Current status**: M1-M7 are implemented end-to-end. Current focus is documentation/branch reconciliation, final role replay, analytics hardening, and notifications V1.

## Active Session

| File | Purpose |
| --- | --- |
| [`active-session/current-task.md`](active-session/current-task.md) | Current repo/product truth and active reconciliation state |
| [`active-session/next-actions.md`](active-session/next-actions.md) | Prioritized next actions |
| [`active-session/blockers.md`](active-session/blockers.md) | Active blockers, soft blockers, and merge risks |
| [`active-session/context.md`](active-session/context.md) | Fresh-session orientation guide; older context may contain stale July state |

## Current Source-of-Truth Rules

1. Repo tree + `git log` are authoritative for implementation state.
2. Notion is authoritative for shared planning intent only after checking for stale rows.
3. `exploration-cache` is authoritative for engineering handoff once updated at session end.
4. `chore/codex-frontend-agents` contains useful frontend work but is not merge-ready against current `main`.

## Project Knowledge

| File | Purpose |
| --- | --- |
| [`project/overview.md`](project/overview.md) | What AIDN is, context, CDC summary |
| [`project/modules-feasibility.md`](project/modules-feasibility.md) | Full 13-module feasibility study and locked decisions |
| [`project/architecture.md`](project/architecture.md) | Stack, auth flow, env vars, data flow |
| [`project/database-schema.md`](project/database-schema.md) | Schema reference; verify against `apps/api/src/shared/db/schema.ts` before edits |
| [`project/decisions.md`](project/decisions.md) | Non-obvious technical decisions with rationale |
| [`project/hardening-plan.md`](project/hardening-plan.md) | Post-M7 workflow hardening plan |
| [`project/workflow-hardening-execution-plan.md`](project/workflow-hardening-execution-plan.md) | Execution sequencing for hardening |

## Technical Reference

| File | Purpose |
| --- | --- |
| [`technical/cheat-sheet.md`](technical/cheat-sheet.md) | Commands, API routes, key paths |
| [`technical/patterns.md`](technical/patterns.md) | Service/controller/route and frontend patterns |
| [`technical/conventions.md`](technical/conventions.md) | Naming, language policy, file structure |
| [`technical/cross-cutting-patterns.md`](technical/cross-cutting-patterns.md) | Reused business-rule patterns |
| [`technical/gotchas.md`](technical/gotchas.md) | Known pitfalls with symptoms and fixes |

## Session History

| File | What Happened |
| --- | --- |
| [`sessions/2026-07-07.md`](sessions/2026-07-07.md) | Sprint 0 + Sprint 1, auth, UI redesign, early bug fixes |
| [`sessions/2026-07-08.md`](sessions/2026-07-08.md) | Build fixes and Sprint 2 / M3 |
| [`sessions/2026-07-09.md`](sessions/2026-07-09.md) | Sprint 2 hardening, settings/dev tools, M3 refactor |
| [`sessions/2026-07-10.md`](sessions/2026-07-10.md) | Upload governance and M5 kickoff |
| [`sessions/2026-07-27.md`](sessions/2026-07-27.md) | Cache/Notion drift correction, M4/M5 confirmed built, M6 started |
| [`sessions/2026-07-27-m6-m7.md`](sessions/2026-07-27-m6-m7.md) | M6 and M7 completed end-to-end |
| [`sessions/2026-07-28.md`](sessions/2026-07-28.md) | Post-M7 workflow hardening, document viewer, Personnel ANAC users |
| [`sessions/2026-09-24.md`](sessions/2026-09-24.md) | Documentation reconciliation across repo, Notion, cache, and unmerged frontend branch |

## Other

| File | Purpose |
| --- | --- |
| [`changelog.md`](changelog.md) | Commit-level and batch-level project evolution |
| [`quick-ref.md`](quick-ref.md) | Human-readable one-pager |
| [`manifest.json`](manifest.json) | Machine-readable index; may lag if not updated |

## End-of-Session Checklist

1. Update `active-session/current-task.md`.
2. Update `active-session/next-actions.md`.
3. Update `active-session/blockers.md` if blockers changed.
4. Add/update a `sessions/YYYY-MM-DD.md` note.
5. Update `changelog.md` if implementation or committed state changed.
6. Reconcile Notion dashboard/backlog if status changed materially.
