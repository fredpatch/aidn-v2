# SESSION1-MEET-1 Meeting confirmation / counter-proposal - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Execution method chosen by Fred: **native** (implemented in-session, slice by slice, validated after each slice; no commit until the final validation report).

**Goal:** M3/M4 meetings proposed by the DN must be confirmed or counter-proposed by the applicant; the DN accepts/refuses counter-proposals; M6 unchanged.

**Architecture:** `meetings.status` stays the lifecycle; new `confirmation_status` + pending alternate columns on `meetings`; append-only `meeting_negotiation_events`; one policy module; all meeting writes transactional with lock order dossier-share -> meeting-for-update.

**Tech Stack:** Express + Drizzle 0.45 / drizzle-kit 0.31 + PostgreSQL; node:test via tsx; React + Vite + vitest + react-query (admin, portal); `@aidn/shared`.

**Spec:** `docs/superpowers/specs/2026-10-14-session1-meet-1-design.md`

## Global Constraints

- Confirmation values exactly: `awaiting_applicant`, `awaiting_dn`, `confirmed`, `not_required`.
- Event kinds exactly: `dn_proposed`, `applicant_confirmed`, `applicant_alternate_proposed`, `dn_alternate_accepted`, `dn_alternate_refused`, `dn_confirmed_on_behalf`, `dn_rescheduled`.
- Migration `0009`: no `ALTER TYPE ... ADD VALUE`.
- DN roles exactly `dn_agent`, `dn_supervisor`, `SU`; no other role gains access.
- Applicant identity only from the token; another applicant's meeting -> 404 `MEETING_NOT_FOUND`.
- Raw `confirmationStatus` / `'awaiting_` literals only inside `apps/api/src/modules/meetings/` and `packages/shared`.
- No email / notification records / reminders.
- French copy verbatim from spec sections 13-14.
- Legacy `confirmed_at = created_at` is a proxy, never shown as a "date de confirmation" KPI.
- Do not start SESSION1-MEET-2.

## Review Focus

1. Applicant's local datetime (datetime-local, no offset) -> must be sent as ISO with offset (`new Date(v).toISOString()`); API rejects offset-less strings. Test in portal dialog test + API validation test.
2. Accept when the applicant's slot equals another live meeting of the same agent -> 409 and the original stays intact (DB test, slot taken by a third meeting).
3. Applicant opens a stale page and confirms after the DN rescheduled -> 409 `MEETING_NOT_SCHEDULED`, not a silent confirm of the superseded row (DB test).
4. A dossier closed while a counter-proposal is pending -> no actions on either side, counters exclude it (DB test on cockpit counts + view `actions: []`).
5. Applicant's view after DN refused, then applicant proposes again -> `lastRefusal` disappears (superseded) (view test).

---

## File map

API (`apps/api/src`)
- `shared/db/schema.ts` - enums, columns, checks, `meetingNegotiationEvents`, `auditLogs.applicantId`.
- `drizzle/0009_session1_meet1_meeting_confirmation.sql` (+ snapshot, journal) - generated then hand-edited data step.
- `modules/meetings/meeting-confirmation.ts` (new) - policy helpers.
- `modules/meetings/meeting-negotiation.events.ts` (new) - writer + readers.
- `modules/meetings/meeting-negotiation.service.ts` (new) - 5 commands.
- `modules/meetings/meeting-negotiation.view.ts` (new) - `MeetingNegotiationView`, applicant block builders.
- `modules/meetings/meetings.service.ts` - transactional core, reschedule/markStatus/report fixes, read models, invitation gating.
- `modules/meetings/meetings.{route,controller,types}.ts`, `applicant-view.ts`, `meeting-invitation.ts`.
- `modules/auth/auth.service.ts` (`logAudit` applicantId), `modules/requests/requests.service.ts` (activity actor + labels).
- `modules/preliminary-evaluation/*`, `modules/formal-request/*` - bundle audience.
- `modules/site-inspection/site-inspection.{service,controller}.ts` - actor passed.
- `modules/dashboard/dashboard.service.ts` - upcoming confirmation-aware.
- `shared/utils/error.ts` - error codes.
- `scripts/seed-analytics-demo-data.ts`, 4 DB tests - explicit confirmation status.
- Tests: `meetings/meeting-confirmation.test.ts`, `meetings/meeting-negotiation.db.test.ts`, `meetings/meeting-negotiation.routes.test.ts`, `meetings/meetings.migrations.test.ts`, `meetings/meeting-confirmation.literals.test.ts`, updates to `applicant-view.test.ts`, `meeting-invitation.test.ts`.

Shared: `packages/shared/src/statuses.ts` (+ invariant test).

Admin (`apps/admin/src`): `lib/api/meetings.{api,types}.ts`, `components/meetings/MeetingNegotiationCard.tsx` (+test), `hooks/useMeetingNegotiationActions.ts`, `pages/phases/preliminary/components/MeetingCard.tsx`, `pages/phases/formal/components/FormalMeetingCard.tsx`, `pages/meetings/MeetingsPage.tsx`, `lib/api/{preliminary,formal}.types.ts`, dashboard upcoming card.

Portal (`apps/portal/src`): `lib/api/meetings.api.ts`, `lib/meetings.ts`, `components/meetings/MeetingConfirmationPanel.tsx` (+test), `components/meetings/MeetingsToConfirmBanner.tsx`, `components/request/MeetingDetails.tsx`, phase sections, `pages/meetings/MeetingsPage.tsx`, dashboard page.

---

### Task 1: Schema, migration 0009, shared constants

**Interfaces - Produces:** `MEETING_CONFIRMATION_STATUSES`, `MeetingConfirmationStatus`, `MEETING_NEGOTIATION_EVENT_KINDS`, `MeetingNegotiationEventKind` (`@aidn/shared`); `meetingConfirmationStatusEnum`, `meetingNegotiationEventKindEnum`, `meetingNegotiationEvents`, `meetings.confirmationStatus|alternateScheduledAt|alternateRemark|confirmedAt`, `auditLogs.applicantId` (schema).

- [ ] Add constants + labels to `packages/shared/src/statuses.ts`; extend `shared-enums.invariant.test.ts` to compare both against the pg enums.
- [ ] Schema:

```ts
export const meetingConfirmationStatusEnum = pgEnum('meeting_confirmation_status', MEETING_CONFIRMATION_STATUSES);
export const meetingNegotiationEventKindEnum = pgEnum('meeting_negotiation_event_kind', MEETING_NEGOTIATION_EVENT_KINDS);
// meetings:
confirmationStatus: meetingConfirmationStatusEnum('confirmation_status').notNull(),
alternateScheduledAt: timestamp('alternate_scheduled_at'),
alternateRemark: text('alternate_remark'),
confirmedAt: timestamp('confirmed_at'),
// checks (table callback):
check('meetings_alternate_coherent_chk', sql`(${t.confirmationStatus} = 'awaiting_dn') = (${t.alternateScheduledAt} IS NOT NULL AND ${t.alternateRemark} IS NOT NULL) AND (${t.alternateScheduledAt} IS NULL) = (${t.alternateRemark} IS NULL)`),
check('meetings_confirmed_at_chk', sql`(${t.confirmationStatus} = 'confirmed') = (${t.confirmedAt} IS NOT NULL)`),
check('meetings_type_confirmation_chk', sql`(${t.meetingType} = 'site_visit') = (${t.confirmationStatus} = 'not_required')`),
```
  `meetingNegotiationEvents` table per spec 1.3 with `meeting_negotiation_events_one_actor_chk` (XOR), `meeting_negotiation_events_payload_chk` (per-kind CASE expression; applicant kinds require `actor_applicant_id`, others `actor_user_id`), index `(meeting_id, created_at, id)`. `auditLogs.applicantId` FK + index + check `audit_logs_single_actor_chk`: `NOT (user_id IS NOT NULL AND applicant_id IS NOT NULL)`.
- [ ] `npm run db:generate -w apps/api` -> rename to `0009_session1_meet1_meeting_confirmation`; hand-edit: column added with `DEFAULT 'confirmed'`, then data step, then `DROP DEFAULT`, then checks (move the ADD CONSTRAINT lines after the UPDATEs).
- [ ] Update every meeting insert (seed script, 4 DB tests) with explicit `confirmationStatus` (+ `confirmedAt` when confirmed).
- [ ] `meetings.migrations.test.ts` (static): 0009 has no `ADD VALUE`; UPDATEs precede the check constraints; `DROP DEFAULT` present.
- [ ] Replay: clean DB (`db:check:replayable`) + DB at 0008 with legacy M3/M4/M6 rows of each status -> migrate -> assert statuses/confirmed_at, then constraint probes (insert incoherent rows -> 23514).
- [ ] Run API typecheck + unit tests + DB tests serially.

### Task 2: Policy, event writer, transactional meeting core, audit fixes

**Produces:**
```ts
// meeting-confirmation.ts
requiresApplicantConfirmation(meetingType: MeetingType): boolean
initialConfirmationStatus(meetingType: MeetingType): 'awaiting_applicant' | 'not_required'  // DN create + DN reschedule only
isMeetingOperationallyConfirmed(m: { confirmationStatus: string }): boolean
canApplicantRespond(m: { status: string; confirmationStatus: string }): boolean
isAwaitingApplicant / isAwaitingDn(m): boolean
// meeting-negotiation.events.ts
appendNegotiationEvent(tx, e: NewNegotiationEvent): Promise<void>
latestRefusals(executor, meetingIds: number[]): Promise<Map<number, RefusalContext>>
historyFor(executor, meetingIds: number[]): Promise<Map<number, NegotiationEventRow[]>>
// meetings.service.ts
lockMeeting(tx, meetingId): Promise<MeetingRow>            // assertMeetingDossierOpen + FOR UPDATE, MEETING_NOT_FOUND
insertMeetingRow(tx, values): Promise<MeetingRow>          // maps 23505 -> MEETING_SLOT_CONFLICT
scheduleMeeting(params: ScheduleMeetingParams & { actorUserId: number })
rescheduleMeeting(meetingId, actorUserId, newScheduledAt, remark?)
markMeetingStatus(meetingId, actorUserId, status)          // requires operational confirmation
logAudit({ ..., applicantId? })
```
- [ ] Unit tests for helpers (all 4 states x 3 types).
- [ ] `scheduleMeeting` in one transaction: phase-dossier guard, insert with `initialConfirmationStatus`, `dn_proposed` event (M3/M4 only), audit `userId: actorUserId`, `details: { dnAgentId }`, module `phase.phaseCode`. Controller passes `req.user!.userId`; `scheduleSiteVisit` gains `actorUserId`.
- [ ] `rescheduleMeeting`: transaction; lock; insert replacement FIRST (initial status of type; scheduled_at new) then old -> `rescheduled` + alternate cleared; M3/M4 events `dn_rescheduled`(old, resulting=new, slot_at=new, remark) + `dn_proposed`(new); audit module from phase. Note: inserting the new row first at the SAME slot as the old row would conflict with the old row itself -> reject `newScheduledAt == old.scheduledAt` with 400 `RESCHEDULE_SAME_SLOT`.
- [ ] `markMeetingStatus`: transaction + lock; `MEETING_NOT_CONFIRMED` unless operationally confirmed; module from phase. `attachMeetingReport` module from phase.
- [ ] DB tests: M6 reschedule into a taken slot leaves original `scheduled` and no new row; actor/module audit for M3/M4/M6; held refused on `awaiting_applicant`.

### Task 3: Negotiation commands + routes

**Produces:** `confirmMeeting(meetingId, applicantId)`, `proposeAlternate(meetingId, applicantId, { scheduledAt, remark })`, `acceptAlternate(meetingId, actorUserId)`, `refuseAlternate(meetingId, actorUserId, reason)`, `confirmOnBehalf(meetingId, actorUserId, note)`; routes per spec 6; Zod `.strict()` bodies; errors in `handleMeetingsError`.
- [ ] Applicant ownership inside the transaction: locked meeting -> phase -> request.applicantId; mismatch -> `MEETING_NOT_FOUND` (checked before the dossier-closed answer is revealed: ownership first, then closed).
- [ ] accept: insert replacement (`confirmed`, `confirmedAt=now`) first, then old -> rescheduled + clear alternate, event, audit.
- [ ] DB tests per spec 20 (applicant + DN + history + rounds + races sequentially simulated by stale states).
- [ ] Static route test: applicant write routes are exactly confirm + propose-alternate; DN negotiation routes `requireRole('dn_agent','dn_supervisor','SU')`.

### Task 4: Read models + invitation gating
- [ ] `ApplicantMeetingItem` / applicant view / bundles(audience) carry the applicant block; batch `latestRefusals`.
- [ ] `MeetingNegotiationView` in cockpit item (no history), `GET /:id` staff, M3/M4 bundles (staff, with history).
- [ ] `alternateSlotTaken` via one query of scheduled rows matching (agent, alternate slot).
- [ ] Invitation: `invitationVoidReason` + 409 `MEETING_INVITATION_NOT_CONFIRMED`; `ticketAvailable`.

### Task 5: Cockpit / dashboard
- [ ] Metrics: `scheduled` = operationally confirmed; `awaiting_applicant`; `counter_proposals` (warning); closed dossiers excluded; action labels; confirmation filter param `confirmation`.
- [ ] `dashboard.service` upcomingMeetings: operationally confirmed only for "planned" count; items carry `confirmationStatus`.

### Task 6: Admin UI
- [ ] `useMeetingNegotiationActions(setActionError, invalidate)`; `MeetingNegotiationCard` (awaiting_applicant badge + elapsed + on-behalf dialog; awaiting_dn warning card + accept/refuse); wired in M3 card, M4 card, Réunions page; held/no-show/cancel hidden unless confirmed; vitest for each state.

### Task 7: Portal UI
- [ ] `MeetingConfirmationPanel` (4 states + refusal notice + dialog), banner "Rendez-vous à confirmer", `lib/meetings.ts` split "À confirmer", ticket only when `ticketAvailable`; vitest.

### Task 8: Audit labels + activity actor + cache docs
- [ ] `ACTIVITY_LABELS` for 5 new actions; activity query `coalesce(u.full_name, ap.full_name)`; cache docs.

### Task 9: Full validation + dev DB migration replay; final review against spec; report.
