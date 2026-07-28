# Next Actions

Last updated: 2026-07-28

## Immediate

1. **Push current Phase 3/M5 + Phase 4/M6 role hardening batch**
   - Includes S5 payment inbox/tasks for M5/M6, S5-only payment APIs,
     applicant-only proof/correction uploads, DN read-only payment cards,
     R3 assigned inspection access, and viewer verdict actions for M5.
   - Verification passed: workspace typecheck + full build.

2. **Phase 5 / M7 deliverance workflow hardening**
   - Replay with DN/SU, S5, and postulant accounts.
   - Apply the same payment ownership review to M7: S5 owns invoice/payment
     validation, DN owns certificate preparation/lifecycle, postulant owns proof.
   - Check certificate lifecycle visibility and portal guidance from payment to
     notification/collection.

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
   - Phase 2, M5, and M6 role hardening are done; continue role-specific checks
     while hardening M7.

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
