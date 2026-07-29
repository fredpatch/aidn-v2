# AIDN v2 - Workflow hardening execution plan

Created: 2026-07-28

This file is the operational plan for hardening the workflow after internal user
management was stabilized. It is meant to be used phase by phase while testing with
real role-specific users (`reception`, `assistant_dg`, `dn_agent`, `dn_supervisor`,
`r3_agent`, `s5_agent`, `SU`) instead of relying on `SU` to simulate every actor.

## Method

For each phase:

1. Simulate the phase with the correct role.
2. Note friction, missing guards, unclear responsibilities, or misleading UI.
3. Fix UI permissions, feedback, document handling, and workflow gates.
4. Verify with the corresponding role users and a full phase transition.
5. Move to the next phase only after the current handoff is clear.

Already done:

- A - Phase navigation and visual feedback (`PhaseSidebar`).
- B partial - Personnel ANAC-backed internal user creation and activation.
- C-V1 - In-app `DocumentViewer` integrated first in M5.

Remaining themes:

- B remaining - fine UI permission audit per role.
- C-V2 - extend `DocumentViewer` to M3, M4, M6, and M7. Done 2026-07-29.
- D-V1 - collapsible cards, especially M4 and M5. Done 2026-07-29.
- E-V1 - notifications for certificate ready, document correction, and rejected dossier.

## Phase 1 - Applicant entrance, intake, and signature circuit

Roles: applicant, `reception`, `assistant_dg`, `dn_agent`, `dn_supervisor`.

Status: started 2026-07-28.

Goal: make sure the workflow starts with a clean postulant account and a single
canonical organisation before any dossier can enter M1/M2.

Important correction:

- The true workflow entrance is not manual dossier creation. Every dossier must be
  attached to a postulant account.
- Normal path: the postulant requests account creation from the portal, ANAC reviews
  and approves it, then the postulant logs in and submits the dossier.
- In-person path: reception helps the postulant create/register their portal account
  first, then scans and records the physical application on behalf of that approved
  applicant.
- Therefore, organisation deduplication must happen before the first dossier is
  created. Otherwise the "one active request per organisation" rule and M12 KPIs can
  be corrupted by variants of the same organisation name.

Applicant account request flow to implement:

- Public portal form with honeypot and minimum elapsed time anti-bot checks.
- Anti-duplicate checks:
  - reject if an active applicant already exists for the contact email;
  - reject if another pending account request already exists for that contact email.
- Store `organisationNameInput` exactly as entered, plus a normalized name used for
  matching suggestions.
- ANAC review screen for `reception`, `assistant_dg`, `dn_agent`, `dn_supervisor`, and
  `SU`:
  - see pending account requests;
  - compare the submitted organisation name/address/email/approval number against
    existing organisations;
  - approve by linking to an existing organisation or creating a new canonical
    organisation;
  - reject with mandatory reason.
- On approval:
  - create the `applicants` row using the reviewed organisation;
  - preserve equal permissions for all contacts of the same organisation;
  - set contact order only as a label (`primary`, `secondary`, `tertiary`);
  - activate the account so the postulant can log in and submit the dossier.
- On rejection:
  - keep the request as history with `rejectionReason`, `reviewedBy`, and `reviewedAt`;
  - do not create an organisation/applicant.

Implemented in second pass:

- Backend: new `/api/account-requests` module.
- Portal: login screen now includes "Demander un compte" with organisation/contact
  details, honeypot field, form-start timestamp, and password capture.
- Backend anti-bot:
  - honeypot must remain empty;
  - minimum elapsed time before submission is enforced.
- Backend anti-duplicate:
  - refuses account request when an applicant already exists for the contact email;
  - relies on the existing partial unique index to allow only one pending request per
    contact email.
- Backend review:
  - staff can list pending account requests;
  - account requests include candidate organisation matches based on normalized name,
    similar name fragments, and original approval number when present;
  - approval can link to an existing organisation or create a new canonical
    organisation;
  - approval creates the applicant account with equal organisation permissions and a
    contact-order label;
  - rejection requires a reason.
- Admin UI: new "Comptes postulants" review page for reception, assistant DG, DN,
  supervisors, and SU.
- Admin UI: reviewer sees submitted organisation/contact details, candidate
  organisations, contact order, link/create approval actions, and mandatory rejection
  reason.

Verified:

- `npm run typecheck --workspaces --if-present`
- `npm run build --workspaces --if-present`

Smoke-test feedback addressed:

- Approval wording is now explicit: reviewer actions say "Approuver et lier a
  l'organisme selectionne" or "Approuver et creer un nouvel organisme" so organisation
  creation is clearly part of account approval, not a separate ambiguous operation.
- Admin "Comptes postulants" now has two tabs:
  - pending account requests;
  - approved applicant accounts.
- Approved applicant accounts can be viewed with contact, organisation, contact-order
  label, and active/inactive status.
- Admin can activate/deactivate applicant portal accounts after approval.
- Portal no longer drops the postulant directly into "Ma demande" after login; it lands
  on a small dashboard with an explicit action to deposit/follow a request.

Signature circuit workflow correction:

- `submitted` now represents a dossier deposited in AIDN, not yet sent into the
  physical signature circuit.
- Added `in_signature_circuit` as a real intermediate circuit status, displayed as
  "En signature".
- Added `signatureSentAt` so the parapheur/signature-delay alert can measure from the
  moment staff actually sends the dossier in signature.
- Admin request list now exposes:
  - `submitted`: "Ouvrir / imprimer", then confirmation from the internal viewer
    ("Impression OK - mettre en signature") before status changes to `En signature`;
  - `in_signature_circuit`: "Scanner demande signee" / "Valider le retour signe";
  - `pending_review`: DN can open M3.
- The scan-back action replaces the current circuit document, marks the signed return,
  and moves the request directly to `pending_review` so DN can consult/open M3.
- Legacy/fallback `signed -> pending_review` action remains visible only for records
  already stuck in the old intermediate `signed` state.
- Portal labels now avoid repeated DG wording: `Deposee`, `En signature`, `Transmise a
  la Direction de la Navigabilite`.
- The "En signature" transition is now modeled in the UI as confirmation that the
  document was printed and physically placed in the signature circuit, not as a
  misleading automatic send.

Verified after smoke-test fixes:

- `npm run typecheck --workspaces --if-present`
- `npm run build --workspaces --if-present`

Organisation deduplication policy:

- `organisations.normalizedName` remains the canonical DB-level uniqueness backstop.
- Similar-but-not-identical organisation names must be surfaced to the reviewer before
  creating a new organisation.
- The reviewer, not the applicant, decides whether "Air Gabon Technik", "A.G. Technik",
  and "Air Gabon Technique SA" are the same organisation.
- Original approval number should be used as a strong matching clue when present, but
  not as the only identifier because older applicants may omit it or write it
  differently.
- Short names and acronyms such as "ADL" for "Aeroport de Libreville" must not force
  a new organisation. The account review screen supports acronym-based automatic
  suggestions and manual organisation search before approval.

Checks:

- Reception/manual request creation still matches permissions.
- Assistant DG/signature circuit actions are clear.
- DN sees actionable requests once transmitted.
- Pending/signature/transmission feedback is obvious.
- Notification for DG blockage remains later work, not part of this first pass.

Expected deliverable:

- A reliable "approved postulant account -> dossier submitted -> request ready for M3"
  baseline.

Implemented in first pass:

- Backend: manual staff submission through `POST /api/requests` is now limited to
  `reception`, `assistant_dg`, and `SU`; applicants can still submit from the portal.
- Backend: staff cancellation of a deposited dossier is limited to `reception`,
  `assistant_dg`, and `SU`; applicants can still cancel only their own request while it
  is still deposited.
- Backend: signature circuit transitions (`mark-signed`, `mark-pending-review`) are limited
  to `reception`, `assistant_dg`, and `SU`; DN can no longer transmit a dossier to
  itself.
- Admin UI: manual intake button/form is hidden for non-intake roles.
- Admin UI: DG transition/cancel buttons are hidden for non-intake roles.
- Admin UI: DN roles see the M3 entrypoint only once the dossier is actually
  `pending_review`.
- Admin UI: added a "Prochaine action" column and a compact handoff guide for the
  intake -> transmission -> DN workflow.

Verified:

- `npm run typecheck --workspaces --if-present`
- `npm run build --workspaces --if-present`

## Phase 2 - M3: Phase Preliminaire

Roles: `dn_agent`, `dn_supervisor`, applicant.

Hardening focus:

- Permission audit on phase opening, meeting planning, meeting status, declaration availability, and closure.
- Extend `DocumentViewer` to declaration/template/returned document links.
- Confirm `PhaseSidebar` and workflow summary explain the next action clearly.
- Verify the applicant only sees meeting ticket, declaration download/upload, and status.

Expected deliverable:

- M3 can be run without `SU`, with clear next-action feedback and in-app document preview.

## Phase 3 - M4: Demande Formelle

Roles: `dn_agent`, `dn_supervisor`, `assistant_dg`, applicant.

Hardening focus:

- D-V1 priority: collapsible cards, because M4 has heavy document volume.
- Extend `DocumentViewer` to official letter and the 10 other submitted documents.
- Verify DG circuit for the formal letter is readable and traceable.
- Permission audit: DN actions vs DG/assistant actions vs applicant uploads.
- Ensure completed sections collapse based on actual state.

Expected deliverable:

- M4 is scannable and clear: documents, meeting, DG circuit, and closure gates are easy to manage.

Implemented D-V1:

- Added a reusable admin `CollapsibleCard`.
- M4 formal letter, document dossier, meeting, and closure sections are collapsible.
- Completed/resolved sections default closed based on real status; active/incomplete sections stay open.

## Phase 4 - M5: Evaluation Approfondie

Roles: `s5_agent`, `dn_agent`, `dn_supervisor`, applicant.

Hardening focus:

- D-V1 priority: collapsible cards for payment and 11 document evaluations.
- Polish the existing M5 `DocumentViewer` if real usage exposes friction.
- E-V1 candidate: document rejected / document to correct notification.
- Verify applicant re-upload is obvious and scoped to the rejected document.
- Confirm S5 payment actions are hidden from unauthorized roles.

Expected deliverable:

- M5 is efficient for repeated document review and correction loops.

Implemented D-V1:

- M5 payment, document evaluation, and closure sections are collapsible.
- Validated payment and fully validated document lists default closed based on real current state.

## Phase 5 - M6: Demonstration / Inspection

Roles: `dn_agent`, `dn_supervisor`, `r3_agent`, `s5_agent`, applicant.

Hardening focus:

- Permission audit around R3 assignment, visit planning, payment validation, and R3 opinion.
- Extend `DocumentViewer` to payment proof/invoice and inspection-related attachments.
- Verify `r3_agent` "Mes Inspections" only exposes assigned dossiers.
- Confirm the applicant never sees the internal R3 opinion.

Expected deliverable:

- M6 properly separates DN, S5, R3, and applicant responsibilities.

## Phase 6 - M7: Delivrance and certificate

Roles: `dn_agent`, `dn_supervisor`, `s5_agent`, applicant.

Hardening focus:

- Extend `DocumentViewer` to invoice/proof and generated certificate admin links.
- E-V1 candidate: certificate ready for withdrawal notification.
- Verify certificate status cycle: preparation -> printed -> signed -> archived -> notified -> withdrawn.
- Confirm the applicant sees simplified status only, with no certificate download.
- Confirm withdrawal closes the workflow cleanly.

Expected deliverable:

- Certificate delivery is operational, traceable, and applicant-facing status stays simple.

## Execution Order

1. Intake and DG Circuit role/permission + feedback pass.
2. M3 role/permission + viewer pass - done.
3. M4 collapsible cards + viewer pass - done.
4. M5 collapsible cards - done; correction notification candidate remains.
5. M6 role/permission + viewer pass - done.
6. M7 workflow/status + viewer pass - done; certificate-ready notification remains.
7. Final end-to-end replay with all role users.
