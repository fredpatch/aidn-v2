# Current Task

**Session date**: 2026-09-25
**Status**: Settings maintenance/dev-reset implementation in progress; not committed yet.

## Current Repo Truth

- Current branch: `main`, with local documentation reconciliation commit `d3d8c16 docs: reconcile project state` ahead of `origin/main`.
- Current working tree has uncommitted settings maintenance/dev-tools changes.
- Latest upstream product commit before local reconciliation: `26f6c71 feat: ai advanced`.
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

1. Review and finish the `Parametres` maintenance/dev reset batch.
2. Keep the settings UI aligned with real code-backed sections only:
   - `Securite` for existing system parameters;
   - `Sauvegardes` for existing upload diagnostics/orphan cleanup, with future backup expansion;
   - `Maintenance` for existing dev reset tooling, now with richer status metadata and session/confirmation gates.
3. Do not reintroduce placeholder tabs such as Finances, E-mails, Recompenses, Catalogue commissions, Notifications, or Apparence until real settings functionality exists for them.
4. After review, decide whether to continue with deeper cleanup scope work such as physical upload/report file cleanup.
5. Keep the frontend-agent branch reconciliation on hold until this settings batch is either committed or reverted.

## Latest Work In Progress - Settings Maintenance

- Admin settings page was reshaped into three tabs backed by existing code paths only.
- Existing dev reset tooling now exposes richer scope metadata for the Maintenance tab.
- API dev reset now requires:
  - `SU` role;
  - `ENABLE_DEV_RESET=true`;
  - environment allowed by the production guard (`ALLOW_PRODUCTION_DEV_RESET=true` is required if `NODE_ENV=production` or `APP_ENV=production`);
  - actor-owned active maintenance session through `POST /api/dev-tools/session`;
  - exact confirmation text `NETTOYER`.
- Maintenance sessions are in-memory and scoped to the SU user who opened them; another SU cannot reuse someone else's session.
- Starting a maintenance session writes a `DEV_MAINTENANCE_SESSION_STARTED` audit entry before any reset action.
- Smoke-test follow-up fixed physical file cleanup for resettable scopes:
  - `reports` now deletes generated files under `uploads/reports`;
  - `requests_and_workflow` now deletes physical files referenced by resettable workflow document versions before DB truncation.
- `document_template` files remain protected. If a protected template file is missing from disk, the admin page now shows a missing-file warning instead of a dead link.
- Existing reset scopes remain explicit and conservative:
  - requests/workflow;
  - organisations/applicants;
  - notifications;
  - audit logs;
  - reports.
- Protected data remains out of scope:
  - staff users;
  - roles;
  - system parameters;
  - document templates.
- Validation already passed:
  - `npm run typecheck --workspace=apps/admin`;
  - `npm run typecheck --workspace=apps/api`;
  - `npm run build --workspace=apps/admin`;
  - `npm run build --workspace=apps/api`.
