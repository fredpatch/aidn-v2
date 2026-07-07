# ⚡ Next Actions

Last updated: 2026-07-07

## 🔥 Immediate (start here next session)

0. **Fix the broken portal build before committing/pushing the current diff** — create
   `apps/portal/src/lib/axios.ts` (mirror `apps/admin/src/lib/axios.ts`, pointed at
   `/applicant-auth/refresh`), then decide whether to also switch
   `useApplicantAuth.tsx` off the old `lib/api.ts` for consistency, and whether the
   now-orphaned `apps/admin/src/lib/api.ts` / `apps/portal/src/lib/api.ts` should be
   deleted. See `active-session/blockers.md` #B0 and `project/decisions.md` #10.

1. **Sprint 2 — Phase Préliminaire (M3)**
   - Réunion scheduling (reuse the "Réunion/Visite" pattern — `meetings` table
     already exists in schema, unused so far)
   - Déclaration de pré-évaluation form (`preliminary_evaluation_forms` table
     already exists, unused so far)
   - No-Show/Reportée/Annulée handling, dynamic return-delay configuration
   - Phase closure pattern (doc attached or note, DN action button)
   - Full UI on both admin (DN sees/schedules meetings, closes phase) — portal has
     no M3-specific UI need yet (postulant just waits for the meeting invitation)

2. **Rename legacy repo** — `aidn-v2` (current, pre-rebuild) → `aidn-v2-legacy`.
   Pure housekeeping, quick, non-blocking, keeps being deferred.

3. **Visual QA of the Sprint 1 redesign** — Fred to confirm Bootstrap/Login/Layout
   actually render as intended; Claude's sandbox can't screenshot a browser.

## 📅 Later (not urgent, don't start until Sprint 2+ is underway)

4. **M13 applicant account creation** (self-registration, anti-bot honeypot +
   timing check, organisation-name dedup, primary/secondary/tertiary contact
   ordering) — currently Sprint 12 per `docs/TASKS.md`, but worth pulling forward
   if manual DB-seeding of test applicants becomes a recurring friction point
5. **Bundle size** — `apps/admin` and `apps/portal` both exceed Vite's 500kB
   warning threshold after adding framer-motion/react-hook-form/zod. Not an error,
   not urgent with 2 pages each, but will need `manualChunks` or dynamic `import()`
   once more sprints add pages
6. **Email sending for the DG-circuit stuck alert** — currently writes to
   `notifications` only; real email wiring is explicitly Sprint 10's job (SMTP
   credentials are ready per Fred, reused from SICOT)

## 📋 Definition of "Sprint 1 Done" (all met)

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
      typechecked — including a genuine cross-app flow test (applicant submits →
      staff sees the same record → staff advances it → applicant sees the updated
      status)
