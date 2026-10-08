# Next Actions

Last updated: 2026-10-08

## Immediate

1. Commit and push K4
   - Confirm docs/cache are current.
   - Run typecheck/tests/build.
   - Commit the K4 code, tests, and records.
   - Push `main` to `origin`.

2. K5 payment validation hardening
   - Add module validation to `validatePayment` for M5/M6/M7, matching `rejectPhasePayment`.
   - Make M7 payment validation plus certificate creation one atomic operation.
   - Preserve existing route contracts and error semantics where possible.

3. Payment input validation
   - Reject blank or whitespace-only payment rejection reasons.
   - Validate `rejectionAction` before DB writes so unknown values return a controlled 400 instead of a PostgreSQL enum error.
   - Decide whether rejecting a payment for an already terminal dossier should be blocked explicitly.

4. Final role replay
   - Replay the full dossier with real role users: reception/assistant DG, DN, S5, R3, postulant, and SU as observer.
   - Include the K3/K4 payment-rejection paths in the replay.
   - Smoke-test workflow, dashboards, `Courriers officiels`, `Paiements S5`, `Mes inspections`, `Reunions`, `Demandes`, `Gestion des utilisateurs`, and `/analytique`.

## Next Product Work

5. M12 analytics hardening
   - Replace broad V1 analytics table loads with targeted aggregate queries once metric definitions are validated.
   - Confirm calendar days vs business days for SLA.
   - Decide whether rejected/cancelled dossiers stay excluded from treatment-delay KPIs.
   - Add monthly scheduled reports and AI-assisted report review after manual PDF/Excel generation is accepted.

6. M11 notifications V1
   - Start with certificate ready, document to correct, and dossier rejected.
   - Clarify whether "consultation obligatoire" means a strong badge or a blocking modal before building the admin notification center.

## Later

7. Frontend-agent branch reconciliation
   - Do not merge `chore/codex-frontend-agents` directly into `main`.
   - Rebase/cherry-pick scoped groups or replay selected refactors on top of current `main`.

8. Bundle size
   - Admin and portal still exceed Vite's 500 kB warning threshold.
   - Code splitting/manual chunks should happen before production hardening.
