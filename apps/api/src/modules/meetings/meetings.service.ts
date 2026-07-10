import { eq, and, gte, lt, ne } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { meetings, phases, requests, users, documentVersions } from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { linkUploadAssetToOwner } from '../uploads/uploads.service.js';
import type { ScheduleMeetingParams, MeetingView } from './meetings.types.js';

export type { ScheduleMeetingParams, MeetingView } from './meetings.types.js';

function isUniqueViolation(error: unknown): boolean {
  const pgCode = (error as { code?: string })?.code;
  const causeCode = (error as { cause?: { code?: string } })?.cause?.code;
  return pgCode === '23505' || causeCode === '23505';
}

function toMeetingView(row: typeof meetings.$inferSelect): MeetingView {
  return {
    id: row.id,
    phaseId: row.phaseId,
    meetingType: row.meetingType,
    dnAgentId: row.dnAgentId,
    scheduledAt: row.scheduledAt,
    location: row.location,
    status: row.status,
    crDocumentUrl: row.crDocumentUrl,
    crUploadedAt: row.crUploadedAt,
    createdAt: row.createdAt,
  };
}

/** Pattern "Reunion / Visite" (M10 conflict rules):
 *  - Hard conflict (same agent, exact same slot) -> blocked by the DB's
 *    unique index, caught here and reported as MEETING_SLOT_CONFLICT.
 *  - Soft overlap (same agent, same day, different time) -> reported back
 *    as a warning, never blocking. */
export async function scheduleMeeting(
  params: ScheduleMeetingParams
): Promise<{ meeting: MeetingView; softOverlapWarning: boolean }> {
  const [phase] = await db.select().from(phases).where(eq(phases.id, params.phaseId));
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  if (phase.status !== 'open') throw new Error('PHASE_NOT_OPEN');

  const scheduledAt = new Date(params.scheduledAt);
  const dayStart = new Date(
    scheduledAt.getFullYear(),
    scheduledAt.getMonth(),
    scheduledAt.getDate()
  );
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const sameDayMeetings = await db
    .select()
    .from(meetings)
    .where(
      and(
        eq(meetings.dnAgentId, params.dnAgentId),
        gte(meetings.scheduledAt, dayStart),
        lt(meetings.scheduledAt, dayEnd),
        ne(meetings.status, 'file_cancelled'),
        ne(meetings.status, 'rescheduled')
      )
    );
  const softOverlapWarning = sameDayMeetings.length > 0;

  try {
    const [meeting] = await db
      .insert(meetings)
      .values({
        phaseId: params.phaseId,
        meetingType: params.meetingType,
        dnAgentId: params.dnAgentId,
        scheduledAt,
        location: params.location,
        status: 'scheduled',
      })
      .returning();

    await logAudit({
      userId: params.dnAgentId,
      action: 'MEETING_SCHEDULED',
      module: phase.phaseCode,
      entityId: meeting.id,
    });

    return { meeting: toMeetingView(meeting), softOverlapWarning };
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error('MEETING_SLOT_CONFLICT');
    throw error;
  }
}

export async function getMeeting(meetingId: number): Promise<MeetingView> {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!meeting) throw new Error('MEETING_NOT_FOUND');
  return toMeetingView(meeting);
}

/** Simple HTML ticket, not a generated PDF - a real PDF generator is a
 *  cross-phase concern (M3+M4+M6 all need one) better built once, later,
 *  than three times now. */
export async function getMeetingTicketHtml(meetingId: number): Promise<string> {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!meeting) throw new Error('MEETING_NOT_FOUND');

  const [phase] = await db.select().from(phases).where(eq(phases.id, meeting.phaseId));
  const [request] = phase
    ? await db.select().from(requests).where(eq(requests.id, phase.requestId))
    : [];
  const [agent] = await db.select().from(users).where(eq(users.id, meeting.dnAgentId));

  const typeLabels: Record<string, string> = {
    preliminary: 'Reunion preliminaire',
    formal: 'Reunion formelle',
    site_visit: 'Visite sur site',
  };

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Invitation - ${typeLabels[meeting.meetingType] ?? meeting.meetingType}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 480px; margin: 40px auto; color: #1a2340; }
  h1 { color: #1b2a5e; font-size: 18px; }
  .ref { color: #6b7a99; font-size: 12px; }
  .box { background: #f4f6fa; border-radius: 8px; padding: 16px; margin-top: 16px; }
  .label { color: #6b7a99; font-size: 11px; text-transform: uppercase; }
  .value { font-weight: bold; margin-bottom: 12px; }
</style>
</head>
<body>
  <h1>AIDN - ${typeLabels[meeting.meetingType] ?? meeting.meetingType}</h1>
  <p class="ref">ANAC Gabon - Direction de la Navigabilite</p>
  <div class="box">
    <div class="label">Reference du dossier</div>
    <div class="value">${request?.reference ?? '-'}</div>
    <div class="label">Date et heure</div>
    <div class="value">${meeting.scheduledAt.toLocaleString('fr-FR')}</div>
    ${meeting.location ? `<div class="label">Lieu</div><div class="value">${meeting.location}</div>` : ''}
    <div class="label">Agent DN</div>
    <div class="value">${agent?.fullName ?? '-'}</div>
  </div>
  <p style="margin-top: 24px; font-size: 11px; color: #6b7a99;">
    Merci de vous presenter a la date et l'heure indiquees. En cas d'empechement,
    contactez la Direction de la Navigabilite.
  </p>
</body>
</html>`;
}

/** DN's choice on a no-show or scheduling issue (project/modules-feasibility.md
 *  M3): held / no_show / file_cancelled are terminal for this meeting row.
 *  "rescheduled" instead creates a brand-new meeting row for the new slot
 *  and marks this one rescheduled - keeps the original slot's history
 *  rather than overwriting it. */
export async function markMeetingStatus(
  meetingId: number,
  actorUserId: number,
  status: 'held' | 'no_show' | 'file_cancelled'
): Promise<MeetingView> {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!meeting) throw new Error('MEETING_NOT_FOUND');
  if (meeting.status !== 'scheduled') throw new Error('MEETING_NOT_SCHEDULED');

  const [updated] = await db
    .update(meetings)
    .set({ status })
    .where(eq(meetings.id, meetingId))
    .returning();

  if (status === 'file_cancelled') {
    const [phase] = await db.select().from(phases).where(eq(phases.id, meeting.phaseId));
    if (phase) {
      await db
        .update(requests)
        .set({
          status: 'rejected',
          rejectionReason: 'Dossier annule suite a absence non justifiee (reunion).',
        })
        .where(eq(requests.id, phase.requestId));
    }
  }

  await logAudit({
    userId: actorUserId,
    action: `MEETING_${status.toUpperCase()}`,
    module: 'M3',
    entityId: meetingId,
  });

  return toMeetingView(updated);
}

export async function rescheduleMeeting(
  meetingId: number,
  actorUserId: number,
  newScheduledAt: string
): Promise<{ meeting: MeetingView; softOverlapWarning: boolean }> {
  const [oldMeeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!oldMeeting) throw new Error('MEETING_NOT_FOUND');
  if (oldMeeting.status !== 'scheduled') throw new Error('MEETING_NOT_SCHEDULED');

  await db.update(meetings).set({ status: 'rescheduled' }).where(eq(meetings.id, meetingId));

  const result = await scheduleMeeting({
    phaseId: oldMeeting.phaseId,
    meetingType: oldMeeting.meetingType as ScheduleMeetingParams['meetingType'],
    dnAgentId: oldMeeting.dnAgentId,
    scheduledAt: newScheduledAt,
    location: oldMeeting.location ?? undefined,
  });

  await logAudit({
    userId: actorUserId,
    action: 'MEETING_RESCHEDULED',
    module: 'M3',
    entityId: meetingId,
    details: { newMeetingId: result.meeting.id },
  });

  return result;
}

/** Optional compte-rendu, only after the meeting is "held" - never
 *  required, DN can send it whenever they want (including replacing an
 *  earlier one, which goes through the M8 version/trash pattern like every
 *  other document in the app). */
export async function attachMeetingReport(
  meetingId: number,
  actorUserId: number,
  fileUrl: string,
  mimeType: string,
  uploadAssetId?: number
): Promise<MeetingView> {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!meeting) throw new Error('MEETING_NOT_FOUND');
  if (meeting.status !== 'held') throw new Error('MEETING_NOT_HELD');

  if (meeting.crDocumentUrl) {
    await db
      .update(documentVersions)
      .set({ isCurrent: false, trashedAt: new Date() })
      .where(eq(documentVersions.ownerId, meetingId));
  }

  await db.insert(documentVersions).values({
    ownerType: 'meeting_report',
    ownerId: meetingId,
    fileUrl,
    mimeType,
    uploadedBy: actorUserId,
    isCurrent: true,
  });

  await linkUploadAssetToOwner({
    uploadAssetId,
    ownerType: 'meeting_report',
    ownerId: meetingId,
    expectedFileUrl: fileUrl,
  });

  const [updated] = await db
    .update(meetings)
    .set({ crDocumentUrl: fileUrl, crUploadedAt: new Date() })
    .where(eq(meetings.id, meetingId))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'MEETING_REPORT_ATTACHED',
    module: 'M3',
    entityId: meetingId,
  });

  return toMeetingView(updated);
}
