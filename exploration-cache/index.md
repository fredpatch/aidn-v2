# 📚 AIDN v2 — Exploration Cache Index

This folder is the living knowledge base for the AIDN v2 project. Update it as the
project evolves. Structure mirrors SICOT's exploration-cache — see
`project/decisions.md` for the one deliberate difference (task tracking lives at
`docs/TASKS.md`, not `exploration-cache/tasks/`).

**Project**: AIDN — Application Informatique de la Direction de la Navigabilité —
ANAC Gabon
**Last updated**: 2026-07-10 | **Sprint**: 0, 1, and 2 (M3) are committed,
Sprint 3 (M4) kickoff is committed, uploads governance controls are committed,
and Sprint 4 (M5) kickoff is in progress with `deep-evaluation` API/admin/portal wiring.

---

## 🟡 Active Session (update every session)

| File                                                               | Purpose                         |
| ------------------------------------------------------------------ | ------------------------------- |
| [`active-session/current-task.md`](active-session/current-task.md) | What we're working on RIGHT NOW |
| [`active-session/next-actions.md`](active-session/next-actions.md) | Prioritized action items        |
| [`active-session/blockers.md`](active-session/blockers.md)         | What's blocking progress        |
| [`active-session/context.md`](active-session/context.md)           | Fresh-session orientation guide |

---

## 📋 Tasks

Master backlog lives at **[`../docs/TASKS.md`](../docs/TASKS.md)** (repo root, not
this folder — see `project/decisions.md` for why). Sprint 0 and Sprint 1 are marked
complete there.

---

## 🏗️ Project Knowledge (mostly static)

| File                                                               | Purpose                                            |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| [`project/overview.md`](project/overview.md)                       | What AIDN is, context, CDC summary                 |
| [`project/modules-feasibility.md`](project/modules-feasibility.md) | Full 13-module feasibility study, locked decisions |
| [`project/architecture.md`](project/architecture.md)               | Stack, auth flow, env vars, data flow              |
| [`project/database-schema.md`](project/database-schema.md)         | All 20 tables + enums                              |
| [`project/decisions.md`](project/decisions.md)                     | Non-obvious technical decisions with rationale     |

---

## 🔧 Technical Reference

| File                                                                         | Purpose                                              |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`technical/cheat-sheet.md`](technical/cheat-sheet.md)                       | Commands, API routes, key paths                      |
| [`technical/patterns.md`](technical/patterns.md)                             | Service/Controller/Route, frontend auth-gate pattern |
| [`technical/conventions.md`](technical/conventions.md)                       | Naming, language policy, file structure              |
| [`technical/cross-cutting-patterns.md`](technical/cross-cutting-patterns.md) | 6 business-rule patterns reused across modules       |
| [`technical/gotchas.md`](technical/gotchas.md)                               | 10 known pitfalls with exact symptoms and fixes      |

---

## 📅 Session History

| File                                               | What Happened                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`sessions/2026-07-07.md`](sessions/2026-07-07.md) | Sprint 0 + Sprint 1 (full stack), 10 real bugs found and fixed, UI redesign to match SICOT                                                                               |
| [`sessions/2026-07-08.md`](sessions/2026-07-08.md) | Fixed both broken builds from `2205261`, then built Sprint 2 (Phase Préliminaire, M3) end to end                                                                         |
| [`sessions/2026-07-09.md`](sessions/2026-07-09.md) | Sprint 2 hardening + M3 admin page refactor: settings/system-parameters UI+API, dev reset tools, meeting CR upload, closure gating fixes, hooks/helpers/components split |
| [`sessions/2026-07-10.md`](sessions/2026-07-10.md) | Uploads governance admin consumption completed and Sprint 4 kickoff started (deep-evaluation API/admin/portal integration)                                               |

---

## 📝 Other

| File                             | Purpose                                     |
| -------------------------------- | ------------------------------------------- |
| [`changelog.md`](changelog.md)   | Commit history with what changed per commit |
| [`quick-ref.md`](quick-ref.md)   | Human-readable one-pager                    |
| [`manifest.json`](manifest.json) | Machine-readable index with search tags     |

---

## 🔄 How to Keep This Up to Date

### Every session start

1. Read `active-session/context.md`
2. Read `active-session/current-task.md`
3. Check `active-session/blockers.md`

### During a session

- Update `active-session/next-actions.md` as items are checked off
- Note any new blockers in `active-session/blockers.md`

### End of session

1. Create or update `sessions/YYYY-MM-DD.md` with what was done
2. Update `active-session/current-task.md` with new state
3. Update `active-session/next-actions.md` with updated priorities
4. Update `changelog.md` if commits were made
5. Update `docs/TASKS.md` sprint statuses
6. Commit the exploration-cache changes
