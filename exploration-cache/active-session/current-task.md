# Current Task

**Session date**: 2026-09-24
**Status**: Documentation/evolution reconciliation before new development.

## Current Repo Truth

- Current branch: `main`, clean and aligned with `origin/main`.
- Latest commit on `main`: `26f6c71 feat: ai advanced`.
- Previous important commit: `d65214c feat(infra): add AIDN staging deployment and reset migrations baseline`.
- The latest `main` includes staging infrastructure and a reset Drizzle migration baseline.
- The latest `main` does **not** include the recent frontend-agent decomposition/table refactor branch.

## Current Product Truth

Sprint 0-6 / M1-M7 remain the implemented baseline:

- M1/M2 intake and DG signature circuit.
- M3 preliminary phase.
- M4 formal request.
- M5 deep evaluation.
- M6 site inspection / R3 workflow.
- M7 certificate issuance.

The app has since evolved into operational cockpits and transverse modules:

- role dashboards for DN/SU, S5, reception/assistant DG, and R3;
- `Demandes`, `Courriers officiels`, `Paiements S5`, `Mes inspections`, and `Reunions` workbenches;
- `Gestion des utilisateurs` cockpit with Personnel ANAC activation;
- `/analytique` analytics cockpit;
- `/api/reports` PDF/Excel report generation and generated-report history;
- staging deployment files and migration baseline reset.

## Reconciliation Findings

- Notion dashboard correctly says M1-M7 are complete and analytics V1 exists.
- Notion backlog still has stale `Not started` rows for several already-built M3 items and reporting export/manual generation items.
- `exploration-cache/quick-ref.md` was stale and still described M4/M5 as ongoing.
- `exploration-cache/changelog.md` had multiple entries marked `(uncommitted)` even though those changes are now part of committed history on `main`.
- The active technical source of truth is the repo tree plus current Git branch; Notion remains the high-level/shared view and needs periodic status cleanup.

## Frontend-Agent Branch Status

Branch `chore/codex-frontend-agents` exists locally and remotely. It contains the recent table/accessibility/decomposition work:

- `ReadOnlyTable`, `SelectableDataTable`, `TableState`, `SelectableTableRow`;
- Account Requests table/panel extractions;
- S5 table/detail/modal/page-chrome extractions;
- Meetings table migration;
- Courrier `ReturnSignedModal` extraction;
- frontend agent documentation.

It must **not** be merged blindly into `main`: it is behind current `main` by the staging/migration commits, and a raw branch diff would remove current staging infra and latest migration files. Next step is a careful rebase/cherry-pick or a fresh scoped replay of selected frontend commits onto `main`.

## Current Focus

1. Finish documentation reconciliation across repo cache and Notion.
2. Decide how to bring `chore/codex-frontend-agents` forward safely.
3. Run a full validation (`npm run typecheck --workspaces --if-present`, `npm run build`) after documentation/branch reconciliation.
4. Resume product work with final role replay, then M12 hardening or M11 notifications.
