# Legacy AIDN phase 2 courrier audit

Date: 2026-07-28

Reference repo cloned locally at:

- `exploration-cache/reference/aidn-v2-legacy`

## Why this audit exists

Phase 2 ("Demande formelle") needs the same physical signature/courrier reality as the initial applicant request:

1. The postulant submits the formal letter from the portal.
2. Reception / assistant DG prints or prepares the physical courrier.
3. The courrier enters the signature circuit.
4. Reception / assistant DG scans the signed return.
5. DN can then continue treatment and schedule the formal meeting.

DN should not be the actor who marks the letter signed or "transmitted to DN" from the formal phase screen. DN waits for the returned signed file and consumes that as a workflow gate.

## Legacy implementation worth reusing

### Generic courrier inbox

Legacy has a dedicated DG/courrier task module:

- API: `apps/api/src/modules/dg-circuit`
- Admin page: `apps/admin/src/pages/dg-circuit`
- Admin client: `apps/admin/src/lib/api/dg-circuit`

The key idea is not Mongo/Mongoose itself, but the workflow shape:

- A generic task list aggregates multiple courrier sources.
- Each task has a `source`, a `bucket`, timestamps, document ids, and `availableActions`.
- The UI is an inbox/detail split, not a phase-specific DN card.

Legacy task sources:

- `initial_request`
- `pre_evaluation`
- `formal_request`

Legacy task buckets:

- `to_transmit`
- `awaiting_return`
- `returned_scanned`
- `decision_recorded`

For our current wording, the visible labels should avoid "DG" where possible:

- `to_transmit` -> "A imprimer / mettre en signature"
- `awaiting_return` -> "En signature"
- `returned_scanned` / `decision_recorded` -> "Retour signe recu"

### Legacy phase-2 formal request behavior

In `dg-circuit.service.ts`, formal requests are included in the same courrier inbox:

- `phaseKey = formal_request`
- source = `formal_request`
- subject = `Demande formelle`
- if the gate courrier exists and no DG review exists, bucket = `to_transmit`
- after transmission, bucket = `awaiting_return`
- after signed scan return, bucket = `decision_recorded`

This confirms the model we want: the formal letter is a courrier task owned by the courrier/signature roles, not a DN-only phase action.

### Legacy UI behavior

Legacy admin courrier UI has:

- `DgCircuitTaskList.tsx`: selectable inbox rows.
- `CourrierTaskRow.tsx`: compact source/status/task cards.
- `DgCircuitTaskDetail.tsx`: detail panel with timeline and contextual actions.
- `PrintConfirmDialog.tsx`: confirmation after print/physical send.
- `DgReturnDialog.tsx`: mandatory signed scan upload.
- `CourrierTimeline.tsx`: submitted -> sent -> returned/proceeded history.
- `DgCircuitFilters.tsx` and `DgCircuitKpis.tsx`: operational filtering and counts.

This is a good reference for building our reception / assistant DG courrier inbox.

## Current AIDN v2 state

Current code already has the right storage foundation:

- `apps/api/src/shared/db/schema.ts`
- `dg_circuit_documents`
- `dg_circuit_status`: `submitted`, `in_signature_circuit`, `signed`, `pending_review`
- `dg_circuit_entity_type`: `intake_request`, `formal_request_letter`
- document versions use `ownerType = dg_circuit_document`

Current M1 already has the preferred operational behavior:

- `apps/admin/src/pages/requests/RequestsPage.tsx`
- `apps/api/src/modules/requests/requests.service.ts`
- print viewer opens the current document.
- confirming print moves the circuit to `in_signature_circuit`.
- scanning signed return replaces the document and moves the circuit directly to `pending_review`.

Current M4/formal phase diverges from the target:

- `apps/api/src/modules/formal-request/formal-request.route.ts`
- `apps/api/src/modules/formal-request/formal-request.service.ts`
- `apps/admin/src/pages/phases/formal/components/FormalLetterCard.tsx`
- `apps/admin/src/pages/phases/formal/helpers.ts`

Problems:

- DN roles can mark the formal letter as signed.
- DN roles can mark it as transmitted to DN.
- The formal phase page presents signature-circuit actions inside DN workspace.
- `canScheduleMeeting()` currently returns true as soon as the letter exists, but the business rule is: schedule only after the signed return is scanned.

## Recommended current-app implementation plan

### 1. Extract shared courrier circuit service

Create a small current-app service around `dg_circuit_documents`:

- find one circuit by `requestId + entityType`
- create circuit with current document version
- confirm printed / put in signature
- record signed return scan
- replace current circuit document via M8 document version pattern

This prevents M1 and M4 from drifting.

### 2. Add a courrier inbox module

Add API endpoints for reception / assistant DG / SU:

- `GET /api/courrier-tasks`
- `POST /api/courrier-tasks/:id/confirm-printed-for-signature`
- `POST /api/courrier-tasks/:id/return-signed`

Task id can be stable and explicit:

- `intake_request:<requestId>`
- `formal_request_letter:<requestId>`

The endpoint should resolve the `entityType`, load the circuit row, enforce transition rules, and return refreshed task data.

### 3. Move formal-letter signature actions out of DN page

In formal phase admin UI:

- Keep the formal letter card visible for DN as read-only status.
- Replace action buttons with guidance:
  - no letter: "En attente de la lettre officielle du postulant."
  - `submitted`: "Courrier recu, en attente d'impression par reception / assistant DG."
  - `in_signature_circuit`: "Lettre en signature."
  - `pending_review`: "Retour signe recu, DN peut poursuivre."
- Remove DN `mark-signed` and `mark-pending-review` actions from normal M4 UI.

### 4. Gate formal meeting scheduling correctly

Change `canScheduleMeeting()` so the formal meeting can be scheduled only when:

- M4 is open.
- formal letter circuit status is `pending_review`.

Keep the same server-side guard too. UI-only gating is not enough.

### 5. Portal phase-2 UX

Portal phase 2 should remain guided:

- show formal letter upload as first compulsory action.
- after upload, show "AIDN traite votre courrier" / "En signature" depending on status.
- only show formal meeting details once DN schedules it.
- documents can be uploaded in parallel if business wants it, but meeting scheduling waits for signed return.

### 6. Role-specific screens

Add a navigation entry for reception / assistant DG / SU:

- "Courriers a traiter"

Future role-specific screens can follow the same pattern:

- S5: payment validation inbox.
- R3: site inspection inbox.
- DN: phase workspace and dossier treatment.

## Edge cases to handle

- Duplicate letter upload: block applicant re-upload after `submitted`; staff can replace only through explicit correction/scan flow.
- Letter uploaded but M4 closed: reject all mutation actions.
- Letter in signature circuit and applicant uploads another file: reject to avoid corrupting physical circuit.
- Wrong signed scan uploaded: allow staff replacement using document versioning, never delete old versions.
- Meeting schedule attempt before signed return: backend must return 409.
- Missing current file URL in courrier task: disable print action and show a clear data-repair message.
- Existing records in `signed`: keep backward compatibility by treating `signed` as a legacy intermediate state, but avoid exposing it as a normal new action.
- Role checks: reception / assistant DG / SU can manage courrier; DN can read the returned status and schedule only after return; postulant can only submit/view own files.
- Notification: postulant should be notified when the letter is received, when it enters signature, and when DN can continue after return.
- Alerts: reuse `dg-circuit-alert.job.ts` for any entity stuck in `in_signature_circuit`, including formal letters.

## Implementation order

1. Backend shared courrier circuit helpers and task list.
2. Backend formal meeting scheduling guard.
3. Admin "Courriers a traiter" inbox for reception / assistant DG.
4. Formal phase DN page cleanup/read-only letter card.
5. Portal phase-2 wording/status polishing.
6. Tests/smoke paths:
   - postulant submits formal letter
   - reception prints/confirm signature circuit
   - DN cannot schedule yet
   - reception scans signed return
   - DN can schedule formal meeting
   - postulant sees guided status updates

