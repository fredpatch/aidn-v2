# SESSION1-MEET-1 - Confirmation / contre-proposition de réunion par le postulant

Status: APPROVED 2026-10-14 (with the refinements of the implementation brief, folded in below).
Base: approved planning report (Option B + light C) and the decisions of the 2026-10-14 brief.
Out of scope: SESSION1-MEET-2, email/notifications, M6 negotiation.

## 0. Understanding (for correction)

When the DN proposes an M3 (`preliminary`) or M4 (`formal`) meeting, the applicant must confirm it or propose another date-time; the DN then accepts or refuses. The accepted appointment remains the authoritative scheduled meeting. M6 (`site_visit`) is unchanged. Success = a DN can no longer mark an applicant absent from a meeting the applicant never confirmed, history is structured and queryable, nothing existing silently changes meaning.

Findings from the code that shape this spec:

- `status = 'scheduled'` is read in: `markMeetingStatus`, `rescheduleMeeting`, `listMeetingCockpit` (action label l.98, upcoming l.203, metric l.221-223), `listApplicantMeetings.ticketAvailable` (l.289), `meeting-invitation.ts` (l.54), `dashboard.service` upcoming meetings (l.612), the `closePhase` / `closeFormalPhase` gates (`phases.service` l.215, `formal-request.service` l.489), and M6 site-visit logic (`site-inspection.service` l.117/371, dashboard l.1665-1730 - these use the M6 `visitStatus`, unaffected).
- Analytics follow-ups (`meeting-follow-up.ts`) only look at `held` meetings: no change.
- `scheduleMeeting` is not transactional and audits `userId: params.dnAgentId`. `rescheduleMeeting` marks the old row `rescheduled` BEFORE inserting the new one, outside a transaction: a slot conflict leaves the old row orphaned as `rescheduled` with no replacement. This spec makes both atomic because the accept-alternate flow depends on the same mechanic.
- Meeting inserts exist in: `meetings.service.ts`, `scripts/seed-analytics-demo-data.ts`, and four DB test files (`meeting-follow-ups.db.test`, `audit-request.db.test`, `closed-dossier-lists.db.test`, `dossier-open.db.test`).
- Latest migration is `0008_session1_m1_dn_director_annotation_enum` (journal idx 8).

## 1. Schema

### 1.1 Shared constants (`packages/shared/src/statuses.ts`)

```ts
export const MEETING_CONFIRMATION_STATUSES = ['awaiting_applicant', 'awaiting_dn', 'confirmed', 'not_required'] as const;
export const MEETING_NEGOTIATION_EVENT_KINDS = [
  'dn_proposed', 'applicant_confirmed', 'applicant_alternate_proposed',
  'dn_alternate_accepted', 'dn_alternate_refused', 'dn_confirmed_on_behalf', 'dn_rescheduled',
] as const;
```

Labels (French) live next to them, as for roles. `shared-enums.invariant.test.ts` is extended to cover both enums.

### 1.2 `meetings` - four columns

| column | type | null | notes |
|---|---|---|---|
| `confirmation_status` | `meeting_confirmation_status` (new pg enum) | NOT NULL | **no permanent DB default** (see 3.2) |
| `alternate_scheduled_at` | `timestamp` | NULL | same type as `scheduled_at` (no tz), pending applicant proposal only |
| `alternate_remark` | `text` | NULL | applicant remark of the pending proposal |
| `confirmed_at` | `timestamp` | NULL | set when `confirmed`; NULL for `not_required` and pending |

Table-level check constraints (Drizzle `check()` in the table callback; current schema has none yet, but drizzle-kit supports them and the generated SQL is plain `ADD CONSTRAINT ... CHECK`):

1. `meetings_alternate_coherent_chk` (strict IFF): `(confirmation_status = 'awaiting_dn') = (alternate_scheduled_at IS NOT NULL AND alternate_remark IS NOT NULL)` AND `(alternate_scheduled_at IS NULL) = (alternate_remark IS NULL)` - no alternate field may be populated in any other state.
2. `meetings_confirmed_at_chk` (strict IFF): `(confirmation_status = 'confirmed') = (confirmed_at IS NOT NULL)` - NULL for awaiting_applicant, awaiting_dn and not_required.
3. `meetings_type_confirmation_chk`: `(meeting_type = 'site_visit') = (confirmation_status = 'not_required')`. This makes the type policy a DB invariant, not only an application one. Deliberate consequence: adding `site_visit` to the confirmation policy later requires a migration; accepted, it is a business-rule change.

The existing partial unique index `meetings_dn_agent_slot_idx` is unchanged: every `status='scheduled'` row reserves `(dnAgentId, scheduledAt)` regardless of confirmation. The pending alternate slot is NOT reserved (the applicant cannot know the agent's agenda; two applicants may propose the same slot; the first accepted wins, the second accept fails with `MEETING_SLOT_CONFLICT`).

### 1.3 `meeting_negotiation_events` (append-only)

| column | type | null | notes |
|---|---|---|---|
| `id` | serial PK | | |
| `meeting_id` | integer FK -> meetings.id | NOT NULL | the meeting on which the step happened |
| `kind` | `meeting_negotiation_event_kind` (new pg enum) | NOT NULL | |
| `slot_at` | timestamp | NULL | slot concerned (proposed / alternate / accepted) |
| `remark` | text | NULL | applicant remark; DN on-behalf note; DN reschedule note |
| `reason` | text | NULL | DN refusal reason |
| `resulting_meeting_id` | integer FK -> meetings.id | NULL | accepted alternate and DN reschedule only |
| `actor_user_id` | integer FK -> users.id | NULL | |
| `actor_applicant_id` | integer FK -> applicants.id | NULL | |
| `created_at` | timestamp | NOT NULL default now() | |

Constraints and indexes:

- `meeting_negotiation_events_one_actor_chk`: `(actor_user_id IS NULL) <> (actor_applicant_id IS NULL)` (exactly one actor = XOR).
- `meeting_negotiation_events_payload_chk` (per kind required fields): `dn_alternate_refused` requires non-blank `reason`; `applicant_alternate_proposed` requires `slot_at` and non-blank `remark`; `dn_confirmed_on_behalf` requires non-blank `remark`; `dn_alternate_accepted` and `dn_rescheduled` require `resulting_meeting_id` and `slot_at`; `dn_proposed` requires `slot_at`.
- `meeting_negotiation_events_meeting_created_idx` on `(meeting_id, created_at, id)`.
- Append-only: no update/delete code path; a service-level test asserts the module exports no mutating function. (A DB trigger is deliberately not added: it conflicts with test cleanup and is out of the project's style.)

`actor_applicant_id` events: only `applicant_confirmed` and `applicant_alternate_proposed`. All other kinds require `actor_user_id` (enforced in the payload check).

## 2. Policy helpers (single place: `meetings/meeting-confirmation.ts`)

```ts
requiresApplicantConfirmation(meetingType): boolean   // 'preliminary' | 'formal'
initialConfirmationStatus(meetingType)                // awaiting_applicant | not_required
isMeetingOperationallyConfirmed({ confirmationStatus }) // confirmed || not_required
canApplicantRespond(meeting)                           // status scheduled && awaiting_applicant
```

No other module compares `meetingType` or `confirmationStatus` literals; they call these. A grep-based guard test fails if `confirmationStatus ===` / `'awaiting_` literals appear outside `meetings/` and the shared constants.

## 3. Migration

### 3.1 Sequence - ONE migration `0009_session1_meet1_meeting_confirmation.sql`

```sql
CREATE TYPE "meeting_confirmation_status" AS ENUM ('awaiting_applicant','awaiting_dn','confirmed','not_required');
CREATE TYPE "meeting_negotiation_event_kind" AS ENUM (...7 values...);

ALTER TABLE "meetings" ADD COLUMN "confirmation_status" "meeting_confirmation_status" NOT NULL DEFAULT 'confirmed';
ALTER TABLE "meetings" ADD COLUMN "alternate_scheduled_at" timestamp;
ALTER TABLE "meetings" ADD COLUMN "alternate_remark" text;
ALTER TABLE "meetings" ADD COLUMN "confirmed_at" timestamp;

-- Hand-appended data step (drizzle-kit does not generate it):
UPDATE "meetings" SET "confirmation_status" = 'not_required' WHERE "meeting_type" = 'site_visit';
UPDATE "meetings" SET "confirmed_at" = "created_at" WHERE "confirmation_status" = 'confirmed';

ALTER TABLE "meetings" ALTER COLUMN "confirmation_status" DROP DEFAULT;
ALTER TABLE "meetings" ADD CONSTRAINT ... CHECK ... (3 checks, after the data steps);
CREATE TABLE "meeting_negotiation_events" (...); -- FKs, checks, index
```

### 3.2 Safety reasoning (not assumed)

- The 55P04 failure from M1-1 is: a value added by `ALTER TYPE ... ADD VALUE` to a PRE-EXISTING enum cannot be used until that transaction commits. Here both enum types are CREATED in the same transaction. PostgreSQL allows using values of an enum type created in the same transaction (the restriction applies only to values added to a type that existed before the transaction). So `DEFAULT 'confirmed'` and `SET ... 'not_required'` are valid in the same migration.
- Drizzle runs all pending migrations in one transaction: still fine, for the same reason, and because no pre-existing enum (`meeting_status`, `internal_role`) is altered.
- This must still be PROVEN, not trusted: the verification gate (section 17) replays migrations on a DB behind 0008 that holds legacy meetings of each type/status and asserts the result, plus a migration guard test in the style of `dn-annotation.migrations.test.ts` asserting that 0009 contains no `ALTER TYPE ... ADD VALUE`.
- The DB default is dropped after the backfill so that every new insert must state its confirmation status explicitly: a forgotten call site fails loudly (NOT NULL violation) instead of silently becoming `confirmed`. The Drizzle schema therefore declares no default. The final DDL state equals the snapshot. All insert sites listed in section 0 must be updated in the same slice (seed script and four DB tests use a shared test helper / explicit field).
- Existing M3/M4 rows -> `confirmed` (by the temporary default), including historical `held` / `no_show` / `rescheduled` / `file_cancelled` rows (meaningful: they happened). `confirmed_at` = `created_at` (technical proxy only; never exposed as a reliable "date de confirmation" KPI). Existing M6 rows -> `not_required`.
- No backfill script and no `db:backfill:*` command needed; deployment = `npm run db:migrate` only.
- Data-step idempotency is moot (runs once inside the migrator's transaction); a failure rolls back the whole batch.
- If the migrator's single-transaction behaviour proves otherwise during replay verification, fallback: split into 0009 (types, columns with default) and a post-migration idempotent script for the two UPDATEs, as in M1-1. This fallback is NOT expected to be needed.

## 4. State definitions

`meetings.status` (lifecycle) is unchanged. Negotiation lives only in `confirmation_status` and only while `status = 'scheduled'`.

| confirmation_status | meaning | alternate fields | confirmed_at |
|---|---|---|---|
| awaiting_applicant | DN slot proposed, applicant must respond | null | null |
| awaiting_dn | applicant proposed alternate, DN must decide | set | null |
| confirmed | M3/M4 appointment confirmed | null | set |
| not_required | M6 | null | null |

Invariant (decided 2026-10-14, implementation): once `status <> 'scheduled'` the row is frozen history - a superseded row keeps the confirmation status and pending alternate it had when superseded (the strict checks stay unconditional; clearing the alternate of an `awaiting_dn` row would violate check 1). Live reads always filter `status = 'scheduled'`; the events table records what happened.

## 5. Transition matrix

`S` = status `scheduled`. "-" = refused with the listed error.

| Action (actor) | from | to | status change | event | error otherwise |
|---|---|---|---|---|---|
| DN create (M3/M4) | - | awaiting_applicant | new row S | dn_proposed | - |
| DN create (M6) | - | not_required | new row S | none | - |
| Applicant confirm | awaiting_applicant | confirmed (confirmed_at=now) | - | applicant_confirmed | 409 `MEETING_NOT_AWAITING_CONFIRMATION` (idempotent 200 if already `confirmed` with S, no new event/audit) |
| Applicant propose alternate | awaiting_applicant | awaiting_dn (+alternate) | - | applicant_alternate_proposed | 409 same; 400 validation |
| DN accept alternate | awaiting_dn | old row `rescheduled` (frozen as awaiting_dn); NEW row confirmed | old: rescheduled | dn_alternate_accepted (on old, resulting=new) | 409 `NO_PENDING_ALTERNATE`; 409 `MEETING_SLOT_CONFLICT` |
| DN refuse alternate | awaiting_dn | awaiting_applicant (same row, alternate cleared) | - | dn_alternate_refused | 409 `NO_PENDING_ALTERNATE`; 400 reason |
| DN confirm on behalf | awaiting_applicant | confirmed | - | dn_confirmed_on_behalf | 409; 400 note |
| DN reschedule M3/M4 | awaiting_applicant / awaiting_dn / confirmed | old `rescheduled` (frozen); new row awaiting_applicant | old: rescheduled | dn_rescheduled (old, resulting=new) + dn_proposed (new) | 409 `MEETING_NOT_SCHEDULED`; 409 slot conflict |
| DN reschedule M6 | not_required | new row not_required | old: rescheduled | none (unchanged) | unchanged |
| DN held / no_show / file_cancelled | confirmed or not_required | - | terminal | none | 409 `MEETING_NOT_CONFIRMED` |

DN reschedule while `awaiting_dn` implicitly supersedes the applicant's pending alternate; the `dn_rescheduled` event records it (the applicant's proposal remains visible in history).

## 6. API

All responses use the existing JSON envelope. Error codes map in the existing controller error table; 404 for any meeting not owned (MEETINGS-IDOR), 403 never reveals existence.

### 6.1 Applicant (`authenticateApplicant`; applicant id only from the token)

`POST /api/meetings/:id/confirm` - no body. 200 -> `ApplicantMeetingView`. Idempotent (see matrix).

`POST /api/meetings/:id/propose-alternate`
```json
{ "scheduledAt": "2026-11-03T09:30:00+01:00", "remark": "string" }
```
Validation (Zod, `strict()` - unknown keys such as `dnAgentId`, `status`, `location` are rejected 400): `scheduledAt` ISO datetime with offset, strictly later than now, different from the current `scheduledAt`; `remark` trimmed, 1..1000 chars. 200 -> `ApplicantMeetingView`.

Route inventory test is extended: these two are the ONLY applicant write routes on meetings.

### 6.2 DN (`authenticate`, `requireRole('dn_agent','dn_supervisor','SU')` - unchanged equivalence)

`POST /api/meetings/:id/alternate/accept` - no body. 200 -> `{ meeting: MeetingView /* the NEW confirmed row */, softOverlapWarning: boolean }`.

`POST /api/meetings/:id/alternate/refuse` - `{ "reason": "string" }` (trimmed 1..1000). 200 -> `MeetingView`.

`POST /api/meetings/:id/confirm-on-behalf` - `{ "note": "string" }` (trimmed 1..1000). 200 -> `MeetingView`.

Existing `PATCH /:id/status` is NOT extended with negotiation actions. `POST /:id/reschedule` keeps its existing body `{ newScheduledAt }` and gains an optional `remark` (stored on `dn_rescheduled`); response unchanged shape.

Error code table: `MEETING_NOT_AWAITING_CONFIRMATION` 409, `NO_PENDING_ALTERNATE` 409, `MEETING_NOT_CONFIRMED` 409, `MEETING_SLOT_CONFLICT` 409 (existing), `MEETING_NOT_SCHEDULED` 409 (existing), `DOSSIER_CLOSED` (existing K7 code/status), `ALTERNATE_IN_PAST` 400, `ALTERNATE_SAME_AS_CURRENT` 400, `MEETING_INVITATION_NOT_CONFIRMED` 409 (ticket route), validation 400.

## 7. Service responsibilities (`meetings/`)

- `meeting-confirmation.ts` - pure policy helpers (section 2).
- `meeting-negotiation.service.ts` - the five commands (confirm, proposeAlternate, acceptAlternate, refuseAlternate, confirmOnBehalf), each `db.transaction`. Imports `lockMeetingForUpdate`, `insertMeetingRow(tx, ...)`.
- `meetings.service.ts` - `scheduleMeeting` / `rescheduleMeeting` / `markMeetingStatus` refactored onto a shared transactional core `scheduleMeetingTx(tx, params, actorUserId)`; read models extended (cockpit, applicant list). `scheduleMeeting` gains `actorUserId` (route passes `req.user.id`); `dnAgentId` is now only the assignment.
- `meeting-negotiation.events.ts` - `appendNegotiationEvent(tx, ...)` (the only writer) and read queries (`latestRefusal`, `historyForPhase`).
- `applicant-view.ts` - extended whitelist (section 9).
- Other modules do not touch these tables.

## 8. Authorization

- Applicant: own meeting only (ownership via phase -> request -> `applicantId`, evaluated inside the locked transaction, not a pre-check); closed dossier -> `DOSSIER_CLOSED`; cannot call DN routes (role middleware); cannot supply DN agent, status, location, phase, `scheduledAt` of the original, cannot accept own alternate, cannot mark held/no-show.
- DN: `dn_agent`, `dn_supervisor`, `SU` on all negotiation routes, any meeting (not only the assigned agent). No other role (`assistant_dn`, reception, r3, finance, DG) gains anything; route-inventory test updated.
- `getMeetingForAuthorizedActor` stays the only single-meeting read path; the ticket route additionally checks confirmation.

## 9. Concurrency / transaction rules

Lock order for every negotiation command and for reschedule / markMeetingStatus:

1. `assertMeetingDossierOpen(tx, meetingId)` (existing, shares a lock on the request row - same order as K7).
2. `SELECT ... FROM meetings WHERE id = $1 FOR UPDATE` (meeting row).
3. Ownership check (applicant) against the locked row's phase -> request.
4. Validate state against the matrix; any mismatch -> the 409 above (idempotent confirm excepted).
5. Writes: event insert + state update (+ replacement row) in the same transaction; audit via `logAudit(..., tx)`.

Accept alternate (never releases the original before the replacement is guaranteed):
1. Steps 1-4 above (state must be `awaiting_dn`).
2. INSERT replacement row (`scheduled`, `confirmed`, `confirmed_at=now`, same phase/type/agent/location, `scheduled_at = alternate_scheduled_at`) FIRST. The original row is still `scheduled` at a different time, so the unique index only fires on a real third-party conflict -> `MEETING_SLOT_CONFLICT`; the thrown error rolls back the whole transaction, the original and its pending alternate are untouched.
3. UPDATE old row: `status='rescheduled'` only (frozen, see section 4).
4. Event `dn_alternate_accepted` (meeting_id = old, resulting = new).

| Race | Outcome |
|---|---|
| Applicant double confirm | 2nd waits on the row lock, sees `confirmed` -> idempotent 200 |
| Confirm vs propose-alternate | serialized; loser sees changed state -> 409 |
| Propose alternate vs DN reschedule | serialized; applicant loses with 409 (`MEETING_NOT_SCHEDULED` if row now `rescheduled`) |
| DN accept twice | 2nd sees `rescheduled`/no pending -> 409 |
| DN accept vs DN refuse | serialized; loser 409 `NO_PENDING_ALTERNATE` |
| Dossier closes mid-response | step 1 -> `DOSSIER_CLOSED` |
| Target slot taken before accept | `MEETING_SLOT_CONFLICT`, full rollback |

`scheduleMeeting` / `rescheduleMeeting` for M6 become transactional with the same insert-first-then-mark-old order; observable M6 behaviour is unchanged except that a slot conflict no longer leaves an orphaned `rescheduled` row (existing defect fixed, test added).

## 10. Event-history model

One row per business step (section 1.3). Timeline of a phase = all events of all meetings of that phase ordered by `(created_at, id)`. An accepted alternate's chain: `dn_proposed(old)` -> `applicant_alternate_proposed(old)` -> `dn_alternate_accepted(old -> new)`; the new row starts confirmed with no event of its own. Refusals stay visible after the mutable fields are cleared. Unlimited rounds append events. Audit log gets a parallel dossier-linked action per step but is NOT the source of truth.

## 11. Applicant API shape

`ApplicantMeetingItem` (list) and `ApplicantMeetingView` (detail) share the new block:

```ts
{
  confirmationStatus: 'awaiting_applicant' | 'awaiting_dn' | 'confirmed' | 'not_required',
  confirmedAt: string | null,
  alternate: { scheduledAt: string; remark: string } | null,   // only when awaiting_dn
  lastRefusal: { reason: string; proposedSlotAt: string; refusedAt: string } | null,
  actions: ('confirm' | 'propose_alternate')[],                // [] unless awaiting_applicant and dossier open
  ticketAvailable: boolean                                     // scheduled && operationally confirmed
}
```

`scheduledAt` is always the ORIGINAL/current authoritative slot. `lastRefusal` is derived from `meeting_negotiation_events` (latest `dn_alternate_refused` for this meeting, only while the meeting is `awaiting_applicant`; cleared in the view once a newer applicant event exists). No mutable `lastRefusalReason` column. Never exposed: `dnAgentId`, `actor_*`, other events, DN notes (`dn_confirmed_on_behalf` remark, `dn_rescheduled` remark).

Batch loading: the list endpoint fetches latest refusals for all awaiting meetings with one query (`DISTINCT ON (meeting_id)`), no N+1.

## 12. Admin API shape

The M3 and M4 bundles (`/preliminary-evaluation/by-request/:id`, `/formal-request/by-request/:id`) are served to BOTH the applicant and staff: the bundle builder takes the audience and returns the applicant block (section 11) to an applicant and `MeetingNegotiationView` to staff. One representation, `MeetingNegotiationView`, embedded wherever a `MeetingView` is returned (cockpit item, M3 bundle meeting, M4 bundle meeting, meeting detail):

```ts
{
  confirmationStatus, confirmedAt,
  alternate: { scheduledAt, remark } | null,
  waitingSince: string | null,           // timestamp of the last DN/applicant event that started the wait
  waitingDays: number | null,            // informational
  alternateSlotTaken: boolean,           // read-time hard-conflict hint for the pending alternate
  availableNegotiationActions: ('accept_alternate'|'refuse_alternate'|'confirm_on_behalf')[],
  history: NegotiationEventView[]        // detail + bundles only; cockpit lists omit it
}
```
`NegotiationEventView = { kind, slotAt, remark, reason, actor: { type: 'dn'|'applicant', name }, createdAt, resultingMeetingId }`. `availableActions` for held/no_show/file_cancelled is empty unless operationally confirmed. Reschedule stays available from any `scheduled` state.

## 13. Portal UX (French)

Placement: the existing meeting cards (`MeetingDetails`, `NextMeetingCard`, `MeetingItems`, phase sections M3/M4, "Mes réunions"). One shared `MeetingConfirmationPanel`.

- awaiting_applicant - title **Rendez-vous proposé**; text *La Direction de la Navigabilité vous propose le rendez-vous suivant.*; date/time prominent; buttons **Confirmer le rendez-vous** and **Proposer une autre date**. Dialog: date et heure proposées (datetime-local, min = now), remarque obligatoire; submit **Envoyer ma proposition**. Errors surface the API message.
- awaiting_dn - title **Nouvelle date proposée**; rows: *Rendez-vous initial*, *Date proposée*, *Votre remarque*; status chip **En attente de validation par la DN**; no buttons.
- After refusal (awaiting_applicant with `lastRefusal`) - same as first state plus a notice **La date proposée n'a pas été retenue par la DN.** with *Motif :* reason; same two actions (the confirm applies to the original slot).
- confirmed - title **Rendez-vous confirmé**, final date/time prominent, invitation link ("Voir mon invitation").
- Dashboard - banner **Rendez-vous à confirmer** (count if >1) when any meeting is `awaiting_applicant`; links to the meeting.
- `isUpcoming` / `splitMeetings` (`lib/meetings.ts`): unconfirmed meetings appear under "À confirmer" first, not as upcoming confirmed; M6 unchanged.
- Closed dossier: panel read-only, no actions.

## 14. Admin UX (French)

Shared `MeetingNegotiationCard` used by Réunions page, `MeetingCard` (M3) and `FormalMeetingCard` (M4); the three views call the same hooks (`useMeetingNegotiationActions`), no per-view action logic. The existing `useMeetingActions` / `useFormalMeetingActions` delegate to it.

- awaiting_applicant - badge **En attente du postulant** + "depuis N jours" (informational, no alert styling); actions **Replanifier** (-> new proposal, existing flow) and **Confirmer au nom du postulant** (dialog, mandatory note: *Comment la confirmation a-t-elle été reçue ? (téléphone, courrier…)*). Held / no-show / cancel hidden.
- awaiting_dn - warning card **Contre-proposition du postulant**: *Rendez-vous initial*, *Date proposée*, *Remarque du postulant*; **Accepter cette date** (if `alternateSlotTaken`, disabled with explanatory tooltip; soft-overlap warning shown after success) and **Refuser** (opens mandatory *Motif du refus*).
- confirmed / not_required - existing actions.
- Réunions page: status filter gains confirmation filter ("À confirmer", "Contre-propositions"); rows carry a badge distinguishing unconfirmed slots.

## 15. Invitation PDF

`getMeetingInvitationPdf` and the ticket route require `status='scheduled'` AND operationally confirmed; otherwise 409 `MEETING_INVITATION_NOT_CONFIRMED` (ticket route; applicant and DN alike). `invitationVoidReason` gains the unconfirmed reason (same function, one place). `ticketAvailable` as in section 11. No proposal PDF. IDOR unchanged (still through `getMeetingForAuthorizedActor`). M6 unaffected (`not_required`).

## 16. Dashboard / analytics

| Read | Rule |
|---|---|
| Réunions cockpit metric `scheduled` ("Réunions prévues", l.221-223) | scheduled AND operationally confirmed |
| Cockpit upcoming list (l.203) | scheduled, future; both confirmed and unconfirmed, with badge; |
| New metric `awaiting_applicant` "En attente du postulant" | count, neutral tone |
| New metric `counter_proposals` "Contre-propositions à traiter" | count `awaiting_dn`, warning tone, action-required |
| Cockpit action label (l.98 "Résoudre la réunion") | confirmed: unchanged; awaiting_applicant: "En attente du postulant"; awaiting_dn: "Répondre à la contre-proposition" |
| `dashboard.service` upcomingMeetings (l.612) | include unconfirmed with a `confirmationStatus` field so the DN dashboard shows the badge; dashboard "planned" counts only confirmed |
| Agent slot / soft-overlap in `scheduleMeeting` | ALL scheduled rows (unchanged) |
| Analytics follow-ups (`meeting-follow-up.ts`, analytics l.186-354) | held only: no change; verified, regression test only |
| M6 dashboards (l.1665-1730) | unchanged |
| K7 closed-dossier filters | negotiation counters drop closed dossiers like the other pending buckets |

## 17. Audit

New actions (all `MEETING_*`, so existing entity/dossier mapping applies; labels added to `ACTIVITY_LABELS` in requests.service): `MEETING_CONFIRMED_BY_APPLICANT`, `MEETING_ALTERNATE_PROPOSED`, `MEETING_ALTERNATE_ACCEPTED`, `MEETING_ALTERNATE_REFUSED`, `MEETING_CONFIRMED_BY_DN`. Applicant-actor audit: `logAudit` only knows `userId` and the existing applicant pattern (`REQUEST_CANCELLED`) hides the applicant in `details` JSON, which is refused. Migration 0009 therefore adds `audit_logs.applicant_id integer NULL REFERENCES applicants(id)` (+ index), `logAudit` accepts `applicantId`, and the dossier activity feed resolves the actor name from users OR applicants. A check forbids both ids at once (system events keep both NULL).

Defect fixes in the touched workflow:
1. `scheduleMeeting` audits `actorUserId` (new parameter), not `dnAgentId`; the assigned agent goes in `details: { dnAgentId }`.
2. Module derived from the meeting's phase (`phase.phaseCode`) for `markMeetingStatus`, `rescheduleMeeting`, `attachMeetingReport`, and all negotiation actions (replace hardcoded `'M3'`). A test covers M3, M4 and M6.

Existing historical audit rows are not rewritten.

## 18. Notifications

None in MEET-1. Visibility is in-app only (portal banner, admin counter-proposal card/metric). Email/in-app notification is documented as deferred (candidate MEET-2 input; not started).

## 19. Backward compatibility

Existing M3/M4 meetings -> `confirmed` (no re-confirmation, no blocked phase closing); existing M6 -> `not_required`; new M3/M4 -> `awaiting_applicant`; new M6 -> `not_required`. Historical rows stay historical, nothing reopens. API additions are additive fields; older portal bundles ignore them. `ticketAvailable` semantics narrow only for unconfirmed meetings, which cannot pre-exist.

## 20. Tests / acceptance

Applicant: confirm own M3; confirm own M4; propose alternate; blank remark -> 400; past date -> 400; same-as-current -> 400; unknown body key (e.g. `dnAgentId`) -> 400; other applicant -> 404 on both routes; closed dossier -> `DOSSIER_CLOSED`; action in `awaiting_dn` -> 409; confirm when `confirmed` -> idempotent 200, no extra event/audit; propose when `confirmed` -> 409; cannot reach DN routes (403).
DN: sees pending alternate; accept creates confirmed replacement + old `rescheduled` + event linking `resulting_meeting_id`; refuse without reason -> 400; refuse restores `awaiting_applicant`, original slot still reserved, alternate cleared; second round works; confirm-on-behalf without note -> 400; reschedule on M3/M4 (incl. from `confirmed`) yields `awaiting_applicant` replacement; reschedule M6 yields `not_required`; stale action -> 409; accept with slot taken -> rollback complete (old row `scheduled`, alternate intact, no event, no new row); two applicants propose same slot -> first accept wins.
Lifecycle: held / no_show / file_cancelled refused (`MEETING_NOT_CONFIRMED`) while awaiting; allowed after confirm and for M6; `closePhase` / `closeFormalPhase` still blocked while negotiating (status `scheduled`); M6 schedule/reschedule/hold flow unchanged; M6 reschedule slot conflict no longer orphans the old row.
History: event per step with correct actor XOR (DB check test: both set / neither set rejected); payload checks reject incomplete events; ordering over multiple rounds; refusal visible after fields cleared; `lastRefusal` in applicant view and hidden once superseded; DN-only notes not in applicant payload.
Invitation: unconfirmed M3/M4 -> 409 (applicant and DN); confirmed -> PDF; M6 -> PDF; other applicant -> 404.
Metrics: confirmed vs pending classification of "Réunions prévues"; waiting and counter-proposal counters; closed dossiers excluded; agent soft-overlap includes unconfirmed rows; analytics follow-ups unchanged.
Audit: actual acting user recorded on create/reschedule; module M3/M4/M6 derived per phase; five new actions map to the dossier timeline.
Migration/static: replay on DB behind 0008 with legacy meetings of each type/status gives confirmed / not_required as specified; guard test (no `ADD VALUE` in 0009); check constraints reject incoherent rows; shared-enum invariant; route-inventory test (only the two applicant write routes, DN roles unchanged); grep guard on literals; portal/admin component tests for every state and the French wording above.
Full validation as in M1-1: API serial DB run, admin, portal, typecheck, lint, migration replay.

## 21. Implementation slices

1. Migration 0009 + schema + shared constants + migration/invariant tests + insert-site updates (seed, 4 DB tests, shared test helper).
2. Policy helpers + event writer + transactional `scheduleMeetingTx` / reschedule / markMeetingStatus refactor + audit actor/module fixes (+ M6 atomicity test).
3. Negotiation service (5 commands) + routes/controllers/Zod + error mapping.
4. Read models: applicant view/list (+ `lastRefusal`), admin `MeetingNegotiationView` in cockpit/bundles/detail, invitation gating.
5. Cockpit/dashboard classification and new metrics.
6. Admin `MeetingNegotiationCard` and wiring in the three views.
7. Portal panel, dashboard banner, `lib/meetings.ts`.
8. Audit labels; cache docs (`current-task.md`, `changelog.md`, `decisions.md`, `gotchas.md` for the temporary-default pattern if it bites).
9. Full validation; replay migration on the dev DB.

Each slice leaves the suite green; slice 1 alone changes no behaviour.

## 22. Remaining ambiguities (none block implementation; defaults chosen)

1. Alternate-date business rules (hours, weekends, maximum horizon): none validated -> only "future and different from current". Confirm.
2. Soft-overlap on accept: warn after the fact (returned flag) vs block. Default: warn only, as today for scheduling.
3. Whether `file_cancelled` should stay unavailable while the applicant is silent (default per brief: yes; DN uses confirm-on-behalf). If DN needs to cancel a never-confirmed meeting, that is a new business rule.
4. `confirmed_at` for legacy M3/M4 rows is set to `created_at` as a proxy; acceptable?
5. Check constraint 3 (type <-> `not_required`) hard-codes the M6 exemption in the DB; later extension of confirmation to M6 needs a migration. Keep, or enforce only in code?

## 23. Implementation notes (2026-10-14, after the build)

- Superseded rows are frozen as they were (decision during the build, see section 4); no alternate field is cleared on
  a `rescheduled` row.
- Applicant audit uses the new `audit_logs.applicant_id` (check: never with `user_id`); dossier activity feeds and the
  DN dashboard feed show the applicant's name.
- `scheduleMeeting` now audits the acting user; to keep M6 unchanged, the R3 dashboard activity also matches
  `details.dnAgentId` (the assigned agent).
- The cockpit adds `pendingNegotiations` (live M3/M4 meetings waiting on someone, any date, open dossiers only,
  counter-proposals first) and a `confirmation` filter; the admin Réunions page shows it as « Rendez-vous à traiter ».
- `POST /meetings/:id/reschedule` keeps its `newScheduledAt` body (+ optional `remark`); rescheduling to the current
  slot is refused (400 `RESCHEDULE_SAME_SLOT`) because the replacement is inserted before the old row is retired.
- Validation-only errors of `propose-alternate` (past date, blank remark, malformed date) are answered before the
  ownership check; they reveal nothing about the meeting.
- `zod` was added to `apps/api` (same version as admin / portal) for the strict bodies.
