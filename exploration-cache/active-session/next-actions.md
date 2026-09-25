# Next Actions

Last updated: 2026-09-25

## Immediate

1. **Finish settings Maintenance review**
   - Review the new `Parametres` tabs against actual code-backed capabilities.
   - Keep only `Securite`, `Sauvegardes`, and `Maintenance` visible for now.
   - Confirm no placeholder tab claims functionality that does not exist yet.
   - Confirm the dev reset flow requires an active session plus `NETTOYER`.
   - Confirm `ENABLE_DEV_RESET=true` remains the backend environment gate.
   - Confirm production-like environments additionally require `ALLOW_PRODUCTION_DEV_RESET=true`.
   - Confirm maintenance sessions are actor-owned and cannot be shared across SU users.

2. **Decide the next Maintenance batch**
   - Keep the current reset scopes explicit and conservative unless deeper file cleanup is audited.
   - Before adding an uploads/report-files reset scope, verify ownership and physical file paths.
   - Do not add real backup/restore UI until backup endpoints/jobs exist.

3. **Frontend-agent branch reconciliation**
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

4. **Final role replay**
   - Replay the full dossier with real role users: reception/assistant DG, DN, S5, R3, postulant, and SU as observer.
   - Confirm completed dossiers show `Termine` and remain auditable from the `Demandes` table.
   - Smoke-test the workflow, dashboard, `Courriers officiels`, `Paiements S5`, `Mes inspections`, `Reunions`, `Demandes`, `Gestion des utilisateurs`, and `/analytique`.
   - For `/analytique`, run `npm run seed:analytics --workspace=apps/api` first and verify KPI counts, charts, delayed dossiers, warnings, and distinct PDF/Excel report outputs.

5. **Validation after reconciliation**
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
