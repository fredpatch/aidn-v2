# Next Actions

Last updated: 2026-09-24

## Immediate

1. **Resolve documentation and branch drift**
   - Treat `main` as the current deployable source of truth.
   - Keep Notion as the high-level shared project view.
   - Keep `exploration-cache` as the technical handoff source.
   - Update Notion backlog rows that are clearly stale after repo verification.
   - Decide how to bring `chore/codex-frontend-agents` forward: rebase/cherry-pick selected commits or replay the useful frontend refactors fresh on `main`.

2. **Frontend-agent branch reconciliation**
   - Do not merge `chore/codex-frontend-agents` directly into `main`.
   - Preserve current `main` staging infra, `.env.staging.example`, Docker/Nginx files, and reset Drizzle migration baseline.
   - Review the branch in scoped groups:
     - frontend agent docs;
     - common table primitives;
     - analytics reporting table migrations;
     - Account Requests decomposition;
     - S5 decomposition;
     - Meetings table migration;
     - Courrier modal extraction.
   - Re-validate each accepted group on top of current `main`.

3. **Final role replay**
   - Replay the full dossier with real role users: reception/assistant DG, DN, S5, R3, postulant, and SU as observer.
   - Confirm completed dossiers show `Termine` and remain auditable from the `Demandes` table.
   - Smoke-test the workflow, dashboard, `Courriers officiels`, `Paiements S5`, `Mes inspections`, `Reunions`, `Demandes`, `Gestion des utilisateurs`, and `/analytique`.
   - For `/analytique`, run `npm run seed:analytics --workspace=apps/api` first and verify KPI counts, charts, delayed dossiers, warnings, and distinct PDF/Excel report outputs.

4. **Validation after reconciliation**
   - Run `npm run typecheck --workspaces --if-present`.
   - Run `npm run build`.
   - Keep the existing Vite large-chunk warning as non-blocking unless it becomes a production hardening task.

## Next Product Work

5. **M12 analytics hardening**
   - Replace broad V1 analytics table loads with targeted aggregate queries once metric definitions are validated.
   - Confirm calendar days vs business days for SLA.
   - Decide whether rejected/cancelled dossiers stay excluded from treatment-delay KPIs.
   - Add monthly scheduled reports and IA-assisted report review after manual PDF/Excel generation is accepted.

6. **M11 notifications V1**
   - Start with certificate ready, document to correct, and dossier rejected.
   - Clarify whether "consultation obligatoire" means a strong badge or a blocking modal before building the admin notification center.

## Later

7. **M13 applicant account polish**
   - Applicant account/self-registration remains a separate product area.
   - Consider explicit organisation alias records if manual acronym matching becomes a repeated reviewer task.
   - Consider applicant email notification on account approval/rejection.

8. **Bundle size**
   - Admin and portal still exceed Vite's 500 kB warning threshold.
   - Admin includes Chart.js and many cockpit screens; code-splitting/manual chunks should happen before production hardening.
