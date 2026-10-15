/** SESSION1-MEET-1 - transactional building blocks shared by every meeting
 *  write (schedule, reschedule, status, report, negotiation).
 *
 *  Lock order, the same everywhere: the dossier row FOR SHARE (K7 guard,
 *  serialises against a concurrent closing), then the meeting row FOR UPDATE.
 *  A replacement row is always inserted BEFORE the old one is released, so a
 *  slot conflict rolls the whole transaction back and the original meeting
 *  keeps its slot. */
import { and, eq, gte, lt, ne } from 'drizzle-orm';
import type { DbTx } from '../../shared/db/index.js';
import { meetings, phases } from '../../shared/db/schema.js';
import { assertMeetingDossierOpen } from '../requests/dossier-open.js';

export type MeetingRow = typeof meetings.$inferSelect;
export type NewMeetingRow = typeof meetings.$inferInsert;

function isUniqueViolation(error: unknown): boolean {
  const pgCode = (error as { code?: string })?.code;
  const causeCode = (error as { cause?: { code?: string } })?.cause?.code;
  return pgCode === '23505' || causeCode === '23505';
}

export function parseSlot(value: string): Date {
  const slot = new Date(value);
  if (Number.isNaN(slot.getTime())) throw new Error('MEETING_INVALID_DATE');
  return slot;
}

/** K7 guard + row lock. MEETING_NOT_FOUND when the id does not exist. */
export async function lockMeeting(tx: DbTx, meetingId: number): Promise<MeetingRow> {
  await assertMeetingDossierOpen(tx, meetingId);
  const [meeting] = await tx.select().from(meetings).where(eq(meetings.id, meetingId)).for('update');
  if (!meeting) throw new Error('MEETING_NOT_FOUND');
  return meeting;
}

/** Insert one meeting; the partial unique index (agent, slot) on scheduled
 *  rows becomes MEETING_SLOT_CONFLICT and aborts the caller's transaction. */
export async function insertMeetingRow(tx: DbTx, values: NewMeetingRow): Promise<MeetingRow> {
  try {
    const [meeting] = await tx.insert(meetings).values(values).returning();
    return meeting;
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error('MEETING_SLOT_CONFLICT');
    throw error;
  }
}

/** Audit module of a meeting = its phase (M3, M4 or M6), never hard-coded. */
export async function phaseCodeOf(tx: DbTx, phaseId: number): Promise<string> {
  const [phase] = await tx.select({ phaseCode: phases.phaseCode }).from(phases).where(eq(phases.id, phaseId));
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  return phase.phaseCode;
}

/** Soft overlap (M10): the agent already has another live meeting that day.
 *  Every scheduled row counts, confirmed or not - it holds the agenda. */
export async function hasSameDayMeeting(
  tx: DbTx,
  dnAgentId: number,
  scheduledAt: Date,
  excludeMeetingId?: number
): Promise<boolean> {
  const dayStart = new Date(scheduledAt.getFullYear(), scheduledAt.getMonth(), scheduledAt.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const conditions = [
    eq(meetings.dnAgentId, dnAgentId),
    gte(meetings.scheduledAt, dayStart),
    lt(meetings.scheduledAt, dayEnd),
    eq(meetings.status, 'scheduled'),
  ];
  if (excludeMeetingId !== undefined) conditions.push(ne(meetings.id, excludeMeetingId));
  const rows = await tx.select({ id: meetings.id }).from(meetings).where(and(...conditions)).limit(1);
  return rows.length > 0;
}
