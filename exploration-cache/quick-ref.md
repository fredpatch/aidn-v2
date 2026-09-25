# AIDN v2 - Quick Reference

One-page orientation. For deeper detail see `technical/cheat-sheet.md`, `active-session/current-task.md`, and `active-session/next-actions.md`.

## Start Dev

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run db:migrate
npm run seed:params --workspace=apps/api
npm run dev
```

Default local services:

- API: `http://localhost:4000`
- Admin: `http://localhost:5173`
- Portal: `http://localhost:5174`

## Current Git State

- Main branch: `main`
- Current source of truth: `origin/main`
- Latest known commit: `26f6c71 feat: ai advanced`
- Staging/infra baseline commit: `d65214c feat(infra): add AIDN staging deployment and reset migrations baseline`
- Important unmerged branch: `chore/codex-frontend-agents`

Do not merge `chore/codex-frontend-agents` directly into `main`; it is behind the current staging/migration baseline. Rebase/cherry-pick scoped groups or replay selected refactors on top of current `main`.

## Where Is...

| Thing | Path |
| --- | --- |
| API entry | `apps/api/src/server.ts` |
| DB schema | `apps/api/src/shared/db/schema.ts` |
| Drizzle migrations | `apps/api/drizzle/` |
| Admin app | `apps/admin/src` |
| Portal app | `apps/portal/src` |
| Shared constants/types | `packages/shared/src` |
| Staging guide | `README-STAGING-INFRA.md` |
| Staging env template | `.env.staging.example` |
| Active handoff | `exploration-cache/active-session/current-task.md` |
| Next actions | `exploration-cache/active-session/next-actions.md` |

## Auth Model

Two separate systems, one API:

```text
Staff:      users + user_roles, matricule + OTP/password, multi-role
Applicant:  applicants, email + password
```

Both JWTs carry `kind: "staff" | "applicant"` and are never interchangeable.

## Operational App Status

Implemented baseline:

- Sprint 0: feasibility, conventions, stack, schema, scaffold.
- Sprint 1: intake and DG signature circuit.
- Sprint 2: M3 preliminary phase.
- Sprint 3: M4 formal request.
- Sprint 4: M5 deep evaluation.
- Sprint 5: M6 site inspection / R3.
- Sprint 6: M7 certificate issuance.

Operational/transverse surfaces now present:

- DN/SU dashboard and `Demandes` cockpit.
- Reception/assistant DG dashboard and `Courriers officiels`.
- S5 dashboard and `Paiements S5`.
- R3 dashboard and `Mes inspections`.
- `Reunions` cockpit.
- `Gestion des utilisateurs` with Personnel ANAC activation.
- `/analytique` analytics cockpit.
- `/api/reports` PDF/Excel report generation and generated report history.

## Key API Areas

```text
/api/bootstrap
/api/auth
/api/applicant-auth
/api/users
/api/personnel-anac
/api/requests
/api/courrier-tasks
/api/phases
/api/preliminary-evaluation
/api/formal-request
/api/deep-evaluation
/api/site-inspection
/api/certificates
/api/meetings
/api/uploads
/api/document-templates
/api/dashboard
/api/analytics
/api/reports
/api/system-parameters
/api/dev-tools
```

## Rules

| Never | Instead |
| --- | --- |
| Run raw `drizzle-kit migrate` as the primary migration path | Use `npm run db:migrate` |
| Trust applicant IDs from applicant request bodies | Use authenticated applicant context |
| Treat staff and applicant tokens as interchangeable | Check JWT `kind` |
| Destructure request bodies without fallback | Use `req.body ?? {}` |
| Merge stale feature branches directly into `main` | Rebase/cherry-pick against current `main` |
| Treat Notion backlog status as authoritative when it conflicts with code | Verify against repo tree and Git history |

## Active Notes

- `/api/dev-tools/reset` is dev-only and now requires `SU`, `ENABLE_DEV_RESET=true`,
  an actor-owned active `/api/dev-tools/session`, exact `NETTOYER` confirmation,
  and `ALLOW_PRODUCTION_DEV_RESET=true` in production-like environments.
- Resettable scopes clean their own physical files where safe (`reports`,
  workflow `document_versions`); `document_template` uploads remain protected and
  must be replaced through `Modeles de documents` if missing.
- Admin `Parametres` currently exposes only code-backed tabs: `Securite`,
  `Sauvegardes`, and `Maintenance`.
- Final role replay is the next product validation gate.
- Notion backlog has known stale rows and is being reconciled.
- M11 notifications are not implemented as a full notification center yet.
- M12 analytics/reporting V1 exists; next work is performance, SLA definitions, monthly scheduling, and AI-assisted report review.
- M13 applicant account/self-registration polish remains a later product area.
- Admin/portal Vite large-chunk warnings remain non-blocking for now.
