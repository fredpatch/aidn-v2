# Next Actions

Last updated: 2026-07-30

## Immediate

1. **Final role replay**
   - Replay the full dossier with real role users: reception/assistant DG, DN,
     S5, R3, postulant, and SU as observer.
   - Confirm completed dossiers show `Termine` and remain auditable from the
     `Demandes` table.
   - Confirm M4/M5 collapsible cards default to the expected open/closed state.
   - Confirm the integrated viewer opens the expected M3/M4/M5/M6/M7 documents.
   - Smoke-test the workflow, dashboard, `Courriers officiels`, `Paiements S5`,
     `Mes inspections`, `Reunions`, and `Demandes` cockpits on desktop and a
     narrow viewport, including terminal/read-only actions.

2. **E - Notifications M11 V1**
   - Start with certificate ready, document to correct, and dossier rejected.
   - Clarify whether "consultation obligatoire" means a strong badge or a blocking
     modal before building the admin notification center.

## Later

3. **M13 applicant account polish**
   - Consider explicit organisation alias records if manual acronym matching becomes
     a repeated reviewer task.
   - Consider applicant email notification on account approval/rejection.

4. **Bundle size**
   - Admin and portal still exceed Vite's 500 kB warning threshold.
   - Admin now includes Chart.js for the request cockpit document chart; not
     blocking, but code-splitting/manual chunks should happen before production
     hardening.
