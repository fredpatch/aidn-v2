# Next Actions

Last updated: 2026-07-28

## Immediate

1. **Push current Phase 1 hardening batch**
   - Includes applicant account requests, organisation dedup/search, postulant
     dashboard, clarified signature circuit, viewer print/confirm flow, migration
     files, and local docs/cache updates.
   - Verification passed: workspace typecheck + full build.

2. **M3 phase hardening pass**
   - Replay with `dn_agent`, `dn_supervisor`, and postulant accounts.
   - Audit permissions around opening M3, planning meetings, making declarations
     available, portal upload, and closure.
   - Extend `DocumentViewer` to M3 declaration/template/returned document links.

3. **D-V1 - reduce scroll on M4/M5**
   - Add accessible collapse/expand behavior to long cards.
   - Default completed/validated cards to collapsed based on real current state,
     not a one-time mount flag.
   - Priority pages: M4 Demande Formelle and M5 Evaluation Approfondie.

4. **C-V2 - extend `DocumentViewer` beyond M5**
   - Reuse the new admin viewer for M3 meeting/declaration files, M4 letter/docs,
     M6 payment files, and M7 payment/certificate admin links.
   - Keep DOC/DOCX fallback as open/download unless field usage proves server-side
     conversion is worth the CPU cost.

5. **B remaining - UI permission audit**
   - Personnel ANAC-backed internal user creation is done.
   - Remaining role hardening is narrower: verify screens do not invite actions
     unavailable to the current role.

## Later

6. **E - Notifications M11 V1**
   - Start with certificate ready, document to correct, dossier rejected.
   - Clarify with Fred whether "consultation obligatoire" means a strong badge or a
     blocking modal.

7. **M13 applicant account polish**
   - Consider explicit organisation alias records if manual acronym matching becomes
     a repeated reviewer task.
   - Consider applicant email notification on approval/rejection.

8. **Bundle size**
   - Admin and portal still exceed Vite's 500 kB warning threshold.
   - Not blocking, but code-splitting/manual chunks should happen before production
     hardening.
