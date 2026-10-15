/** SESSION1-MEET-1 - the two read shapes of a meeting negotiation.
 *
 *  - ApplicantNegotiationBlock: what the portal needs, flattened into every
 *    applicant meeting payload (list, detail, M3/M4 bundles). Narrow on
 *    purpose: no staff ids, no DN notes, no raw event history - only the
 *    latest refusal while it is still the applicant's turn.
 *  - MeetingNegotiationView: what the DN needs, nested as `negotiation` in
 *    every staff meeting payload (cockpit item, detail, M3/M4 bundles); the
 *    phase history is added where a single meeting is shown (detail, bundles). */
import { and, eq, inArray, ne, or } from 'drizzle-orm';
import {
  MEETING_NEGOTIATION_EVENT_LABELS,
  type MeetingConfirmationStatus,
  type MeetingNegotiationEventKind,
} from '@aidn/shared';
import { db } from '../../shared/db/index.js';
import { meetings } from '../../shared/db/schema.js';
import {
  canApplicantRespond,
  isAwaitingApplicant,
  isAwaitingDn,
  isConfirmedScheduledMeeting,
} from './meeting-confirmation.js';
import {
  historyByMeeting,
  latestEventByMeeting,
  type NegotiationEventRow,
  type NegotiationEventWithActor,
} from './meeting-negotiation.events.js';
import type { MeetingRow } from './meeting-write.js';

const DAY_MS = 86_400_000;

export type ApplicantMeetingAction = 'confirm' | 'propose_alternate';
export type DnNegotiationAction = 'accept_alternate' | 'refuse_alternate' | 'confirm_on_behalf';

export interface ApplicantNegotiationBlock {
  confirmationStatus: MeetingConfirmationStatus;
  confirmedAt: string | null;
  /** The applicant's own pending counter-proposal (awaiting_dn only). */
  alternate: { scheduledAt: string; remark: string } | null;
  /** Latest DN refusal, while the applicant has to answer again. */
  lastRefusal: { reason: string; proposedSlotAt: string; refusedAt: string } | null;
  actions: ApplicantMeetingAction[];
  /** The invitation PDF exists only for a live, confirmed appointment. */
  ticketAvailable: boolean;
}

export interface NegotiationEventView {
  kind: MeetingNegotiationEventKind;
  label: string;
  meetingId: number;
  slotAt: string | null;
  remark: string | null;
  reason: string | null;
  actor: { type: 'dn' | 'applicant'; name: string | null };
  createdAt: string;
  resultingMeetingId: number | null;
}

export interface MeetingNegotiationView {
  confirmationStatus: MeetingConfirmationStatus;
  confirmedAt: string | null;
  alternate: { scheduledAt: string; remark: string } | null;
  /** Since when the meeting waits for the applicant or the DN (informational). */
  waitingSince: string | null;
  waitingDays: number | null;
  /** The pending alternate slot is already held by another live meeting of the agent. */
  alternateSlotTaken: boolean;
  availableNegotiationActions: DnNegotiationAction[];
  /** Phase history (all meetings of the phase); omitted in lists. */
  history?: NegotiationEventView[];
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function alternateOf(meeting: MeetingRow): { scheduledAt: string; remark: string } | null {
  return isAwaitingDn(meeting) && meeting.alternateScheduledAt && meeting.alternateRemark
    ? { scheduledAt: meeting.alternateScheduledAt.toISOString(), remark: meeting.alternateRemark }
    : null;
}

export function buildApplicantBlock(
  meeting: MeetingRow,
  latest: NegotiationEventRow | undefined,
  dossierClosed: boolean
): ApplicantNegotiationBlock {
  const respondable = canApplicantRespond(meeting);
  // The refusal is current only while it is the meeting's latest step: any
  // later step (new proposal, confirmation, reschedule) supersedes it.
  const refusal = respondable && latest?.kind === 'dn_alternate_refused' ? latest : null;
  return {
    confirmationStatus: meeting.confirmationStatus,
    confirmedAt: iso(meeting.confirmedAt),
    alternate: meeting.status === 'scheduled' ? alternateOf(meeting) : null,
    lastRefusal:
      refusal && refusal.reason && refusal.slotAt
        ? { reason: refusal.reason, proposedSlotAt: refusal.slotAt.toISOString(), refusedAt: refusal.createdAt.toISOString() }
        : null,
    actions: respondable && !dossierClosed ? ['confirm', 'propose_alternate'] : [],
    ticketAvailable: isConfirmedScheduledMeeting(meeting),
  };
}

function toEventView(event: NegotiationEventWithActor): NegotiationEventView {
  return {
    kind: event.kind,
    label: MEETING_NEGOTIATION_EVENT_LABELS[event.kind],
    meetingId: event.meetingId,
    slotAt: iso(event.slotAt),
    remark: event.remark,
    reason: event.reason,
    actor: { type: event.actorApplicantId ? 'applicant' : 'dn', name: event.actorName },
    createdAt: event.createdAt.toISOString(),
    resultingMeetingId: event.resultingMeetingId,
  };
}

export function buildNegotiationView(
  meeting: MeetingRow,
  context: {
    latest: NegotiationEventRow | undefined;
    alternateSlotTaken: boolean;
    dossierClosed: boolean;
    now: Date;
    history?: NegotiationEventView[];
  }
): MeetingNegotiationView {
  const live = meeting.status === 'scheduled';
  const waiting = live && (isAwaitingApplicant(meeting) || isAwaitingDn(meeting));
  const waitingSince = waiting ? (context.latest?.createdAt ?? meeting.createdAt) : null;
  const actions: DnNegotiationAction[] = [];
  if (live && !context.dossierClosed) {
    if (isAwaitingDn(meeting)) actions.push('accept_alternate', 'refuse_alternate');
    if (isAwaitingApplicant(meeting)) actions.push('confirm_on_behalf');
  }
  return {
    confirmationStatus: meeting.confirmationStatus,
    confirmedAt: iso(meeting.confirmedAt),
    alternate: live ? alternateOf(meeting) : null,
    waitingSince: iso(waitingSince),
    waitingDays: waitingSince ? Math.max(0, Math.floor((context.now.getTime() - waitingSince.getTime()) / DAY_MS)) : null,
    alternateSlotTaken: live && isAwaitingDn(meeting) && context.alternateSlotTaken,
    availableNegotiationActions: actions,
    ...(context.history ? { history: context.history } : {}),
  };
}

/** Meetings (by id) whose pending alternate slot is already held by another
 *  live meeting of the same agent - the accept would hit the unique index. */
async function takenAlternates(rows: MeetingRow[]): Promise<Set<number>> {
  const pending = rows.filter((row) => row.status === 'scheduled' && isAwaitingDn(row) && row.alternateScheduledAt);
  if (pending.length === 0) return new Set();
  const holders = await db
    .select({ id: meetings.id, dnAgentId: meetings.dnAgentId, scheduledAt: meetings.scheduledAt })
    .from(meetings)
    .where(
      and(
        eq(meetings.status, 'scheduled'),
        or(
          ...pending.map((row) =>
            and(eq(meetings.dnAgentId, row.dnAgentId), eq(meetings.scheduledAt, row.alternateScheduledAt!), ne(meetings.id, row.id))
          )
        )
      )
    );
  const taken = new Set<number>();
  for (const row of pending) {
    if (holders.some((h) => h.dnAgentId === row.dnAgentId && h.scheduledAt.getTime() === row.alternateScheduledAt!.getTime())) {
      taken.add(row.id);
    }
  }
  return taken;
}

/** Applicant blocks for a batch of meetings (one events query). */
export async function applicantBlocksFor(
  rows: MeetingRow[],
  isClosed: (meeting: MeetingRow) => boolean
): Promise<Map<number, ApplicantNegotiationBlock>> {
  const latest = await latestEventByMeeting(
    db,
    rows.map((row) => row.id)
  );
  return new Map(rows.map((row) => [row.id, buildApplicantBlock(row, latest.get(row.id), isClosed(row))]));
}

/** Staff views for a batch of meetings. withPhaseHistory adds, to each
 *  meeting, the chronological history of every meeting of its phase. */
export async function negotiationViewsFor(
  rows: MeetingRow[],
  isClosed: (meeting: MeetingRow) => boolean,
  options: { withPhaseHistory?: boolean } = {}
): Promise<Map<number, MeetingNegotiationView>> {
  const now = new Date();
  const [latest, taken] = await Promise.all([
    latestEventByMeeting(
      db,
      rows.map((row) => row.id)
    ),
    takenAlternates(rows),
  ]);

  let historyByPhase = new Map<number, NegotiationEventView[]>();
  if (options.withPhaseHistory && rows.length > 0) {
    const phaseIds = [...new Set(rows.map((row) => row.phaseId))];
    const phaseMeetings = await db
      .select({ id: meetings.id, phaseId: meetings.phaseId })
      .from(meetings)
      .where(inArray(meetings.phaseId, phaseIds));
    const history = await historyByMeeting(
      db,
      phaseMeetings.map((m) => m.id)
    );
    historyByPhase = new Map(
      phaseIds.map((phaseId) => [
        phaseId,
        phaseMeetings
          .filter((m) => m.phaseId === phaseId)
          .flatMap((m) => history.get(m.id) ?? [])
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
          .map(toEventView),
      ])
    );
  }

  return new Map(
    rows.map((row) => [
      row.id,
      buildNegotiationView(row, {
        latest: latest.get(row.id),
        alternateSlotTaken: taken.has(row.id),
        dossierClosed: isClosed(row),
        now,
        history: options.withPhaseHistory ? (historyByPhase.get(row.phaseId) ?? []) : undefined,
      }),
    ])
  );
}
