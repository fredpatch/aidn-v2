/** SESSION1-MEET-1 - the five negotiation commands of an M3/M4 meeting.
 *
 *  Applicant: confirm, or propose another date-time (with a remark).
 *  DN (dn_agent, dn_supervisor, SU): accept or refuse the counter-proposal,
 *  or confirm on the applicant's behalf (offline confirmation, with a note).
 *
 *  Each command is one transaction: dossier guard + meeting row lock
 *  (meeting-write.ts), state check, state change, negotiation event, audit.
 *  A command that loses a race sees the winner's state and gets a 409. */
import { eq } from 'drizzle-orm';
import { db, type DbTx } from '../../shared/db/index.js';
import { meetings } from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { isAwaitingApplicant, isAwaitingDn } from './meeting-confirmation.js';
import { appendNegotiationEvent } from './meeting-negotiation.events.js';
import {
  hasSameDayMeeting,
  insertMeetingRow,
  lockMeeting,
  lockOwnedMeeting,
  parseSlot,
  phaseCodeOf,
  type MeetingRow,
} from './meeting-write.js';

function requiredText(value: string | undefined, errorCode: string): string {
  const text = value?.trim() ?? '';
  if (!text) throw new Error(errorCode);
  return text;
}

function assertScheduled(meeting: MeetingRow): void {
  if (meeting.status !== 'scheduled') throw new Error('MEETING_NOT_SCHEDULED');
}

function assertAwaitingApplicant(meeting: MeetingRow): void {
  assertScheduled(meeting);
  if (!isAwaitingApplicant(meeting)) throw new Error('MEETING_NOT_AWAITING_CONFIRMATION');
}

function assertPendingAlternate(meeting: MeetingRow): void {
  assertScheduled(meeting);
  if (!isAwaitingDn(meeting)) throw new Error('NO_PENDING_ALTERNATE');
}

async function setConfirmation(
  tx: DbTx,
  meetingId: number,
  values: Partial<Pick<MeetingRow, 'confirmationStatus' | 'confirmedAt' | 'alternateScheduledAt' | 'alternateRemark'>>
): Promise<MeetingRow> {
  const [updated] = await tx.update(meetings).set(values).where(eq(meetings.id, meetingId)).returning();
  return updated;
}

/** Applicant confirms the proposed slot. Idempotent: confirming an already
 *  confirmed live meeting returns it unchanged (no new event, no audit). */
export async function confirmMeeting(meetingId: number, applicantId: number): Promise<MeetingRow> {
  return db.transaction(async (tx) => {
    const meeting = await lockOwnedMeeting(tx, meetingId, applicantId);
    if (meeting.status === 'scheduled' && meeting.confirmationStatus === 'confirmed') return meeting;
    assertAwaitingApplicant(meeting);

    const updated = await setConfirmation(tx, meetingId, { confirmationStatus: 'confirmed', confirmedAt: new Date() });
    await appendNegotiationEvent(tx, { meetingId, kind: 'applicant_confirmed', actor: { applicantId } });
    await logAudit(
      {
        applicantId,
        action: 'MEETING_CONFIRMED_BY_APPLICANT',
        module: await phaseCodeOf(tx, meeting.phaseId),
        entityId: meetingId,
      },
      tx
    );
    return updated;
  });
}

/** Applicant proposes another exact date-time with a remark. The original
 *  slot stays scheduled (and reserved) until the DN decides. */
export async function proposeAlternate(
  meetingId: number,
  applicantId: number,
  input: { scheduledAt: string; remark: string }
): Promise<MeetingRow> {
  const alternateAt = parseSlot(input.scheduledAt);
  const remark = requiredText(input.remark, 'ALTERNATE_REMARK_REQUIRED');
  if (alternateAt.getTime() <= Date.now()) throw new Error('ALTERNATE_IN_PAST');

  return db.transaction(async (tx) => {
    const meeting = await lockOwnedMeeting(tx, meetingId, applicantId);
    assertAwaitingApplicant(meeting);
    if (alternateAt.getTime() === meeting.scheduledAt.getTime()) throw new Error('ALTERNATE_SAME_AS_CURRENT');

    const updated = await setConfirmation(tx, meetingId, {
      confirmationStatus: 'awaiting_dn',
      alternateScheduledAt: alternateAt,
      alternateRemark: remark,
    });
    await appendNegotiationEvent(tx, {
      meetingId,
      kind: 'applicant_alternate_proposed',
      actor: { applicantId },
      slotAt: alternateAt,
      remark,
    });
    await logAudit(
      {
        applicantId,
        action: 'MEETING_ALTERNATE_PROPOSED',
        module: await phaseCodeOf(tx, meeting.phaseId),
        entityId: meetingId,
      },
      tx
    );
    return updated;
  });
}

/** DN accepts the stored counter-proposal (no date supplied by the DN).
 *  The confirmed replacement is inserted FIRST: if its slot is taken the
 *  whole transaction rolls back and the original meeting, its slot and the
 *  pending proposal stay exactly as they were. */
export async function acceptAlternate(
  meetingId: number,
  actorUserId: number
): Promise<{ meeting: MeetingRow; softOverlapWarning: boolean }> {
  return db.transaction(async (tx) => {
    const meeting = await lockMeeting(tx, meetingId);
    assertPendingAlternate(meeting);
    const acceptedAt = meeting.alternateScheduledAt!;

    const softOverlapWarning = await hasSameDayMeeting(tx, meeting.dnAgentId, acceptedAt, meeting.id);
    const replacement = await insertMeetingRow(tx, {
      phaseId: meeting.phaseId,
      meetingType: meeting.meetingType,
      dnAgentId: meeting.dnAgentId,
      scheduledAt: acceptedAt,
      location: meeting.location,
      status: 'scheduled',
      confirmationStatus: 'confirmed',
      confirmedAt: new Date(),
    });
    // Superseded row: frozen as it was (awaiting_dn + the accepted proposal).
    await tx.update(meetings).set({ status: 'rescheduled' }).where(eq(meetings.id, meetingId));

    await appendNegotiationEvent(tx, {
      meetingId,
      kind: 'dn_alternate_accepted',
      actor: { userId: actorUserId },
      slotAt: acceptedAt,
      resultingMeetingId: replacement.id,
    });
    await logAudit(
      {
        userId: actorUserId,
        action: 'MEETING_ALTERNATE_ACCEPTED',
        module: await phaseCodeOf(tx, meeting.phaseId),
        entityId: meetingId,
        details: { newMeetingId: replacement.id },
      },
      tx
    );
    return { meeting: replacement, softOverlapWarning };
  });
}

/** DN refuses the counter-proposal with a reason. Same meeting, original
 *  slot unchanged: the applicant may confirm it or propose again. */
export async function refuseAlternate(meetingId: number, actorUserId: number, reason: string): Promise<MeetingRow> {
  const text = requiredText(reason, 'REFUSAL_REASON_REQUIRED');
  return db.transaction(async (tx) => {
    const meeting = await lockMeeting(tx, meetingId);
    assertPendingAlternate(meeting);

    const updated = await setConfirmation(tx, meetingId, {
      confirmationStatus: 'awaiting_applicant',
      alternateScheduledAt: null,
      alternateRemark: null,
    });
    await appendNegotiationEvent(tx, {
      meetingId,
      kind: 'dn_alternate_refused',
      actor: { userId: actorUserId },
      slotAt: meeting.alternateScheduledAt,
      reason: text,
    });
    await logAudit(
      {
        userId: actorUserId,
        action: 'MEETING_ALTERNATE_REFUSED',
        module: await phaseCodeOf(tx, meeting.phaseId),
        entityId: meetingId,
      },
      tx
    );
    return updated;
  });
}

/** DN records a confirmation received offline (phone, mail...). The note
 *  saying how is kept in the history; it is never shown to the applicant. */
export async function confirmOnBehalf(meetingId: number, actorUserId: number, note: string): Promise<MeetingRow> {
  const text = requiredText(note, 'CONFIRMATION_NOTE_REQUIRED');
  return db.transaction(async (tx) => {
    const meeting = await lockMeeting(tx, meetingId);
    assertAwaitingApplicant(meeting);

    const updated = await setConfirmation(tx, meetingId, { confirmationStatus: 'confirmed', confirmedAt: new Date() });
    await appendNegotiationEvent(tx, {
      meetingId,
      kind: 'dn_confirmed_on_behalf',
      actor: { userId: actorUserId },
      remark: text,
    });
    await logAudit(
      {
        userId: actorUserId,
        action: 'MEETING_CONFIRMED_BY_DN',
        module: await phaseCodeOf(tx, meeting.phaseId),
        entityId: meetingId,
      },
      tx
    );
    return updated;
  });
}
