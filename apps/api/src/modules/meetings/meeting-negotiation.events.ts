/** SESSION1-MEET-1 - meeting_negotiation_events: the structured, append-only
 *  history of an M3/M4 meeting negotiation. This module is its only writer
 *  (insert only - no update, no delete) and its reader. The audit log mirrors
 *  each step for the dossier timeline but is not the source of truth. */
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { MeetingNegotiationEventKind } from '@aidn/shared';
import type { DbExecutor, DbTx } from '../../shared/db/index.js';
import { applicants, meetingNegotiationEvents, users } from '../../shared/db/schema.js';

export type NegotiationActor = { userId: number } | { applicantId: number };

export interface NewNegotiationEvent {
  meetingId: number;
  kind: MeetingNegotiationEventKind;
  actor: NegotiationActor;
  slotAt?: Date | null;
  remark?: string | null;
  reason?: string | null;
  resultingMeetingId?: number | null;
}

export type NegotiationEventRow = typeof meetingNegotiationEvents.$inferSelect;

export interface NegotiationEventWithActor extends NegotiationEventRow {
  actorName: string | null;
}

export async function appendNegotiationEvent(tx: DbTx, event: NewNegotiationEvent): Promise<void> {
  await tx.insert(meetingNegotiationEvents).values({
    meetingId: event.meetingId,
    kind: event.kind,
    slotAt: event.slotAt ?? null,
    remark: event.remark ?? null,
    reason: event.reason ?? null,
    resultingMeetingId: event.resultingMeetingId ?? null,
    actorUserId: 'userId' in event.actor ? event.actor.userId : null,
    actorApplicantId: 'applicantId' in event.actor ? event.actor.applicantId : null,
  });
}

/** The most recent event of each meeting (one query, no N+1). */
export async function latestEventByMeeting(
  executor: DbExecutor,
  meetingIds: number[]
): Promise<Map<number, NegotiationEventRow>> {
  if (meetingIds.length === 0) return new Map();
  const rows = await executor
    .selectDistinctOn([meetingNegotiationEvents.meetingId])
    .from(meetingNegotiationEvents)
    .where(inArray(meetingNegotiationEvents.meetingId, meetingIds))
    .orderBy(
      meetingNegotiationEvents.meetingId,
      desc(meetingNegotiationEvents.createdAt),
      desc(meetingNegotiationEvents.id)
    );
  return new Map(rows.map((row) => [row.meetingId, row]));
}

/** Full chronological history of the given meetings, with the actor's name. */
export async function historyByMeeting(
  executor: DbExecutor,
  meetingIds: number[]
): Promise<Map<number, NegotiationEventWithActor[]>> {
  const history = new Map<number, NegotiationEventWithActor[]>();
  if (meetingIds.length === 0) return history;
  const rows = await executor
    .select({
      event: meetingNegotiationEvents,
      actorName: sql<string | null>`coalesce(${users.fullName}, ${applicants.fullName})`,
    })
    .from(meetingNegotiationEvents)
    .leftJoin(users, eq(users.id, meetingNegotiationEvents.actorUserId))
    .leftJoin(applicants, eq(applicants.id, meetingNegotiationEvents.actorApplicantId))
    .where(and(inArray(meetingNegotiationEvents.meetingId, meetingIds)))
    .orderBy(asc(meetingNegotiationEvents.createdAt), asc(meetingNegotiationEvents.id));
  for (const { event, actorName } of rows) {
    const list = history.get(event.meetingId) ?? [];
    list.push({ ...event, actorName });
    history.set(event.meetingId, list);
  }
  return history;
}
