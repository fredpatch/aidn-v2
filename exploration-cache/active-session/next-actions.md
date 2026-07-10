# ⚡ Next Actions

Last updated: 2026-07-10

## 🔥 Immediate (start here next session)

1. **Finalize and commit/push the current Sprint 4 kickoff diff** —
   deep-evaluation API/admin/portal integration plus cache/docs sync.

2. **Sprint 4 — Évaluation approfondie (M5)**
   - complete admin card actions end-to-end (invoice/proof/payment review,
     document verdict updates, correction flow, closure)
   - complete portal applicant flows for proof submission and corrected document
     resubmission UX polish/validation
   - run full API/frontend typecheck and basic cURL smoke checks for each new
     route before closing the batch

3. **Sprint 3 — Phase Demande formelle (M4) follow-through**
   - Reuses `dg_circuit_documents` (already generic across M1/M4, see
     `project/database-schema.md`) and the same "Réunion/Visite" meeting pattern
   - The 3 `document_templates` keys already seeded for this
     (`dn_air_r2_3_f_e_010/011/012`) — build the endpoints/UI that actually use them
   - Consider whether the meeting-ticket HTML approach (`project/decisions.md` #12)
     still holds or whether M4's needs finally justify a real PDF generator
   - **Delta**: backend + admin M4 kickoff are in place; portal now has the M4 section and the modular React Query/lib-api refactor is complete in the same working batch

4. **Add `PORTAL_ORIGIN` to `apps/api/.env.example`** — currently only in local
   `.env`, needed for `authenticateEither`'s origin-based cookie check

5. **Visual QA of Sprint 1 + Sprint 2 + Sprint 3 + Sprint 4 kickoff UI** — Fred to confirm
   M3/M4/M5 flows render as intended; Claude's sandbox
   cannot screenshot a browser

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
