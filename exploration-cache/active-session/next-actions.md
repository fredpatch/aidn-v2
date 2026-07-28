# ⚡ Next Actions

Last updated: 2026-07-28

## 🔥 Immediate

1. **Push current hardening batch**
   - Includes cross-phase workflow summaries, M4 traceability, C-V1 document viewer
     for M5, Personnel ANAC internal user activation, local docs/cache/changelog,
     and Notion updates.
   - Verification already passed: workspace typecheck + full build.

2. **D-V1 — reduce scroll on M4/M5**
   - Add accessible collapse/expand behavior to long cards.
   - Default completed/validated cards to collapsed based on real current state,
     not a one-time mount flag.
   - Priority pages: M4 Demande Formelle and M5 Évaluation Approfondie.

3. **C-V2 — extend `DocumentViewer` beyond M5**
   - Reuse the new admin viewer for M3 meeting/declaration files, M4 letter/docs,
     M6 payment files, and M7 payment/certificate admin links.
   - Keep DOC/DOCX fallback as open/download unless field usage proves server-side
     conversion is worth the CPU cost.

4. **B remaining — UI permission audit**
   - Personnel ANAC-backed internal user creation is done.
   - Remaining role hardening is narrower: verify screens do not invite actions
     unavailable to the current role.

## Later

5. **E — Notifications M11 V1**
   - Start with certificate ready, document to correct, dossier rejected.
   - Clarify with Fred whether "consultation obligatoire" means a strong badge or a
     blocking modal.

6. **M13 applicant account creation**
   - Self-registration, anti-bot timing/honeypot, organisation dedup/review.
   - Manual DB-seeded applicants remain the current testing workaround.

7. **Bundle size**
   - Admin and portal still exceed Vite's 500 kB warning threshold.
   - Not blocking, but code-splitting/manual chunks should happen before production
     hardening.
