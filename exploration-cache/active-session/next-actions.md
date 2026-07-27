# ⚡ Next Actions

Last updated: 2026-07-27

## 🔥 Immediate (start here next session)

1. **Sprint 5 — Démonstration/Inspection sur Site (M6)** — current task, API first
   - `r3_agent` role and `site_inspections` table already exist in schema
     (schema-ready, zero endpoints/UI)
   - `r3_agent` reuses existing staff `users`/`user_roles` auth — no separate
     login, role-filtered dossier queue in admin only
   - Facture + preuve de paiement: reuse M5's pattern exactly (invoice upload,
     proof upload, validate/reject)
   - Site visit scheduling: reuse `meetings` module, likely a new
     `meeting_type` value (check `project/decisions.md` #12 re: ticket
     approach before building)
   - R3 verdict submission: single action, verdict + note together
     (`inspectionVerdictEnum` + `note` on `site_inspections`)
   - Phase closure is **automatic** on verdict submission — no DN decision
     step, different from M3/M4/M5's manual closure gate
   - Sequence: API module + routes + typecheck first, confirm with Fred,
     then admin UI, then portal (if applicant-facing at all — M6 is
     internal-only per feasibility doc, confirm no portal surface needed)

2. **Add `PORTAL_ORIGIN` to `apps/api/.env.example`** — still only in local
   `.env`, needed for `authenticateEither`'s origin-based cookie check
   (carried over, still unresolved)

3. **Visual QA backlog** — Fred to confirm M3–M5 flows render as intended;
   Claude's sandbox cannot screenshot a browser (unchanged limitation)

4. **Sprint 6 (M7 — Délivrance & Certificats) prep, not started yet**
   - Certificate templates now in `docs/`: `CERTIFICAT_DAGREMENT_RAG-5_3.docx`,
     `CERTIFICAT_DE_RECONNAISSANCE_DAGREMENT_RAG-5_3.docx` — field layout
     confirmed to match `certificate_type` enum already in schema

## 📅 Later (not urgent, don't start until Sprint 3+ is underway)

6. **M13 applicant account creation** (self-registration, anti-bot honeypot +
   timing check, organisation-name dedup, primary/secondary/tertiary contact
   ordering) — currently Sprint 12 per `docs/TASKS.md`, but worth pulling forward
   if manual DB-seeding of test applicants becomes a recurring friction point
7. **Bundle size** — `apps/admin` and `apps/portal` both exceed Vite's 500kB
   warning threshold. Not an error, not urgent yet, but will need `manualChunks` or
   dynamic `import()` as more sprints add pages
8. **Email sending for the DG-circuit stuck alert** — currently writes to
   `notifications` only; real email wiring is explicitly Sprint 10's job (SMTP
   credentials are ready per Fred, reused from SICOT)
9. **Personnel/annuaire ANAC integration** to replace Sprint 1's manual user
   creation — see `docs/TASKS.md` Sprint 12 section and
   `active-session/current-task.md`'s leftover items

## 📋 Definition of "Sprint 2 Done" (all met)

- [x] Ouverture de phase M3, passe la demande en `in_progress`
- [x] Planification réunion + statuts (tenue/No-Show/Reportée/Annulée) + reschedule
- [x] Conflit dur bloqué en DB, chevauchement doux signalé (non bloquant)
- [x] Mise à disposition de la déclaration de pré-évaluation (via `document_templates`)
- [x] Upload retour formulaire par le postulant
- [x] Clôture de phase (doc attaché ou note)
- [x] Délai de retour configurable dynamiquement par DN
- [x] UI admin complète + UI portail complète
- [x] `document_templates` généralisé, prêt pour M4 (Sprint 3)
- [x] Typecheck propre sur les 3 workspaces (api, admin, portal)

## 📋 Definition of "Sprint 1 Done" (all met, for reference)

- [x] `POST /api/requests` — single endpoint, portal self-submit or staff manual entry
- [x] `Déposé → Signé → En attente de traitement` circuit
- [x] One-active-request rule — enforced as a real DB constraint, not just app logic
- [x] Cancel lock (only in `Déposé`), enforced for both staff and applicant callers
- [x] Stuck-parapheur alert job (notifications only)
- [x] Reference generator `DEM-YYYY-MM-DD-ORGCODE-NN`
- [x] Full admin UI: bootstrap, login, requests list + circuit actions, manual entry
      form, users management
- [x] Full portal UI: login, submit form (with real upload), status + cancel + history
- [x] All of the above verified against a real running Postgres instance, not just
      typechecked — including a genuine cross-app flow test
