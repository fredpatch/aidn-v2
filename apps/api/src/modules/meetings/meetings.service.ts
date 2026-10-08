import { eq, and, gte, lt } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import {
  applicants,
  dgCircuitDocuments,
  meetings,
  organisations,
  phases,
  requests,
  users,
  documentVersions,
} from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { logoDataUri, renderHtmlToPdf } from '../../shared/pdf/html-pdf.js';
import { toApplicantMeetingView, type ApplicantMeetingView } from './applicant-view.js';
import {
  buildMeetingInvitationHtml,
  invitationFileName,
  type MeetingInvitationData,
} from './meeting-invitation.js';
import { relocateDossierAssetAfterCommit, type RelocationTarget } from '../files/relocate-asset.js';
import {
  claimUploadAsset,
  linkLockedAsset,
  trashCurrentVersions,
  versionValues,
  type PreparedAttachment,
} from '../uploads/upload-attachment.js';
import type {
  ApplicantMeetingItem,
  MeetingCockpitItem,
  MeetingCockpitSummary,
  ScheduleMeetingParams,
  MeetingView,
} from './meetings.types.js';
import { lacksMeetingReport } from './meeting-follow-up.js';

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

const PHASE_LABELS: Record<string, string> = {
  M3: 'Preliminaire',
  M4: 'Demande formelle',
  M5: 'Evaluation approfondie',
  M6: 'Demonstration / Inspection',
  M7: 'Delivrance',
};

const MEETING_TYPE_LABELS: Record<string, string> = {
  preliminary: 'Reunion preliminaire',
  formal: 'Reunion formelle',
  site_visit: 'Visite sur site',
};

const MEETING_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Planifiee',
  held: 'Tenue',
  no_show: 'Absence',
  rescheduled: 'Reprogrammee',
  file_cancelled: 'Dossier annule',
};

function phaseHref(phaseCode: string, requestId: number): string {
  if (phaseCode === 'M3') return `/demandes/${requestId}/phase-preliminaire`;
  if (phaseCode === 'M4') return `/demandes/${requestId}/phase-formelle`;
  if (phaseCode === 'M5') return `/demandes/${requestId}/evaluation-approfondie`;
  if (phaseCode === 'M6') return `/demandes/${requestId}/demonstration-inspection`;
  return `/demandes/${requestId}/delivrance`;
}

function canManageMeeting(meetingType: string): boolean {
  return meetingType === 'preliminary' || meetingType === 'formal';
}

function meetingActionLabel(row: typeof meetings.$inferSelect): string {
  if (!canManageMeeting(row.meetingType)) return 'Suivi inspection R3';
  if (row.status === 'scheduled') return 'Resoudre la reunion';
  if (row.status === 'held' && !row.crDocumentUrl) return 'Compte-rendu facultatif';
  if (row.status === 'held' && row.crDocumentUrl) return 'Compte-rendu depose';
  if (row.status === 'rescheduled') return 'Historique conserve';
  return 'Consulter';
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toCockpitItem(row: {
  meeting: typeof meetings.$inferSelect;
  phase: typeof phases.$inferSelect;
  request: typeof requests.$inferSelect;
  organisation: typeof organisations.$inferSelect;
  applicant: typeof applicants.$inferSelect;
  agent: typeof users.$inferSelect;
}): MeetingCockpitItem {
  return {
    id: row.meeting.id,
    phaseId: row.phase.id,
    phaseCode: row.phase.phaseCode,
    phaseLabel: PHASE_LABELS[row.phase.phaseCode] ?? row.phase.phaseCode,
    phaseStatus: row.phase.status,
    requestId: row.request.id,
    requestReference: row.request.reference,
    requestType: row.request.requestType,
    organisationName: row.organisation.name,
    applicantName: row.applicant.fullName,
    meetingType: row.meeting.meetingType,
    meetingTypeLabel: MEETING_TYPE_LABELS[row.meeting.meetingType] ?? row.meeting.meetingType,
    status: row.meeting.status,
    statusLabel: MEETING_STATUS_LABELS[row.meeting.status] ?? row.meeting.status,
    scheduledAt: row.meeting.scheduledAt.toISOString(),
    location: row.meeting.location,
    dnAgentId: row.meeting.dnAgentId,
    dnAgentName: row.agent.fullName,
    crDocumentUrl: row.meeting.crDocumentUrl,
    crUploadedAt: row.meeting.crUploadedAt?.toISOString() ?? null,
    ticketUrl: `/api/meetings/${row.meeting.id}/ticket`,
    phaseHref: phaseHref(row.phase.phaseCode, row.request.id),
    canManage: canManageMeeting(row.meeting.meetingType),
    actionLabel: meetingActionLabel(row.meeting),
  };
}

export async function listMeetingCockpit(params: {
  from?: string;
  to?: string;
  meetingType?: string;
  status?: string;
  phaseCode?: string;
}): Promise<MeetingCockpitSummary> {
  const now = new Date();
  const periodStart = params.from ? new Date(params.from) : startOfDay(now);
  const periodEnd = params.to ? new Date(params.to) : addDays(periodStart, 7);

  const conditions = [
    gte(meetings.scheduledAt, periodStart),
    lt(meetings.scheduledAt, periodEnd),
  ];
  if (params.meetingType && params.meetingType !== 'all') {
    conditions.push(eq(meetings.meetingType, params.meetingType as typeof meetings.$inferSelect['meetingType']));
  }
  if (params.status && params.status !== 'all') {
    conditions.push(eq(meetings.status, params.status as typeof meetings.$inferSelect['status']));
  }
  if (params.phaseCode && params.phaseCode !== 'all') {
    conditions.push(eq(phases.phaseCode, params.phaseCode as typeof phases.$inferSelect['phaseCode']));
  }

  const rows = await db
    .select({
      meeting: meetings,
      phase: phases,
      request: requests,
      organisation: organisations,
      applicant: applicants,
      agent: users,
    })
    .from(meetings)
    .innerJoin(phases, eq(meetings.phaseId, phases.id))
    .innerJoin(requests, eq(phases.requestId, requests.id))
    .innerJoin(organisations, eq(requests.organisationId, organisations.id))
    .innerJoin(applicants, eq(requests.applicantId, applicants.id))
    .innerJoin(users, eq(meetings.dnAgentId, users.id))
    .where(and(...conditions))
    .orderBy(meetings.scheduledAt);

  const items = rows.map(toCockpitItem);
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const upcoming = items
    .filter((item) => item.status === 'scheduled' && new Date(item.scheduledAt) >= now)
    .slice(0, 6);
  // K6 - shared rule with the analytics overview (meeting-follow-up.ts).
  const missingReportIds = new Set(
    rows.filter((row) => lacksMeetingReport(row.meeting, row.request.status)).map((row) => row.meeting.id)
  );
  const missingReports = items.filter((item) => missingReportIds.has(item.id));
  const heldThisPeriod = items.filter((item) => item.status === 'held');
  const todayMeetings = items.filter((item) => {
    const date = new Date(item.scheduledAt);
    return date >= todayStart && date < tomorrowStart;
  });

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    metrics: [
      {
        key: 'scheduled',
        label: 'Reunions prevues',
        value: items.filter((item) => item.status === 'scheduled').length,
        helper: 'Creneaux planifies sur la periode',
        tone: 'info',
      },
      {
        key: 'today',
        label: "Aujourd'hui",
        value: todayMeetings.length,
        helper: 'Reunions au calendrier du jour',
        tone: todayMeetings.length > 0 ? 'warning' : 'success',
      },
      {
        key: 'missing_reports',
        label: 'Comptes-rendus manquants',
        value: missingReports.length,
        helper: 'Facultatif - reunions tenues sans compte-rendu',
        // K6 - optional document: information, never an alert (Fred).
        tone: 'info',
      },
      {
        key: 'held',
        label: 'Reunions tenues',
        value: heldThisPeriod.length,
        helper: 'Reunions marquees tenues',
        tone: 'success',
      },
    ],
    items,
    upcoming,
    missingReports,
    updatedAt: now.toISOString(),
  };
}

/** Pattern "Reunion / Visite" (M10 conflict rules):
 *  - Hard conflict (same agent, exact same active slot) is blocked by the
 *    DB's partial unique index on scheduled meetings.
 *  - Soft overlap only considers meetings still planned for that day.
 *    Historical rows (held, no-show, cancelled, rescheduled) do not occupy
 *    the agenda anymore. */
/**
 * Every meeting of every dossier owned by this applicant, oldest first.
 * Ownership is part of the query (requests.applicantId), not a post-filter,
 * so another applicant's meeting can never be selected. Superseded rows
 * (status 'rescheduled') are kept: the portal lists them in the history.
 */
export async function listApplicantMeetings(applicantId: number): Promise<ApplicantMeetingItem[]> {
  const rows = await db
    .select({ meeting: meetings, phase: phases, request: requests })
    .from(meetings)
    .innerJoin(phases, eq(meetings.phaseId, phases.id))
    .innerJoin(requests, eq(phases.requestId, requests.id))
    .where(eq(requests.applicantId, applicantId))
    .orderBy(meetings.scheduledAt);

  return rows.map(({ meeting, phase, request }) => ({
    id: meeting.id,
    meetingType: meeting.meetingType,
    status: meeting.status,
    scheduledAt: meeting.scheduledAt.toISOString(),
    location: meeting.location,
    phaseCode: phase.phaseCode,
    requestId: request.id,
    requestReference: request.reference,
    requestType: request.requestType,
    crDocumentUrl: meeting.crDocumentUrl,
    ticketAvailable: meeting.status === 'scheduled',
  }));
}

export async function scheduleMeeting(
  params: ScheduleMeetingParams
): Promise<{ meeting: MeetingView; softOverlapWarning: boolean }> {
  const [phase] = await db.select().from(phases).where(eq(phases.id, params.phaseId));
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  if (phase.status !== 'open') throw new Error('PHASE_NOT_OPEN');

  if (params.meetingType === 'formal') {
    const [letterCircuit] = await db
      .select()
      .from(dgCircuitDocuments)
      .where(
        and(
          eq(dgCircuitDocuments.requestId, phase.requestId),
          eq(dgCircuitDocuments.entityType, 'formal_request_letter')
        )
      );
    if (!letterCircuit || letterCircuit.status !== 'pending_review') {
      throw new Error('FORMAL_LETTER_RETURN_REQUIRED');
    }
  }

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
        eq(meetings.status, 'scheduled')
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

export interface MeetingActor {
  applicant?: { applicantId: number };
  user?: { roles?: string[] };
}

interface AuthorizedMeetingContext {
  meeting: typeof meetings.$inferSelect;
  phase: typeof phases.$inferSelect | null;
  request: typeof requests.$inferSelect | null;
}

/** MEETINGS-IDOR - the only authorized way to read a single meeting by id.
 *  Staff role policy is already enforced by requireApplicantOrRole at the
 *  route layer; this helper's job is the object-level check a role check
 *  alone can't do - an applicant may only ever see a meeting that belongs,
 *  through phase -> request, to their own dossier. A cross-dossier
 *  applicant gets the same MEETING_NOT_FOUND as a genuinely missing id,
 *  never a 403, so existence isn't disclosed. */
export async function getMeetingForAuthorizedActor(
  meetingId: number,
  actor: MeetingActor
): Promise<AuthorizedMeetingContext> {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!meeting) throw new Error('MEETING_NOT_FOUND');

  const [phase] = await db.select().from(phases).where(eq(phases.id, meeting.phaseId));
  const [request] = phase
    ? await db.select().from(requests).where(eq(requests.id, phase.requestId))
    : [];

  if (actor.applicant && (!request || request.applicantId !== actor.applicant.applicantId)) {
    throw new Error('MEETING_NOT_FOUND');
  }

  return { meeting, phase: phase ?? null, request: request ?? null };
}

export async function getMeeting(
  meetingId: number,
  actor: MeetingActor
): Promise<MeetingView | ApplicantMeetingView> {
  const { meeting } = await getMeetingForAuthorizedActor(meetingId, actor);
  const view = toMeetingView(meeting);
  return actor.applicant ? toApplicantMeetingView(view) : view;
}

/** Invitation PDF (Batch L - replaces the earlier plain HTML ticket).
 *  Consumes the same authorized meeting/context as getMeeting
 *  (MEETINGS-IDOR) - no independent unscoped refetch by id. */
export async function getMeetingInvitationPdf(
  meetingId: number,
  actor: MeetingActor
): Promise<{ pdf: Buffer; fileName: string }> {
  const { meeting, request } = await getMeetingForAuthorizedActor(meetingId, actor);
  const [organisation] = request
    ? await db.select({ name: organisations.name }).from(organisations).where(eq(organisations.id, request.organisationId))
    : [];
  const [contact] = request
    ? await db.select({ fullName: applicants.fullName }).from(applicants).where(eq(applicants.id, request.applicantId))
    : [];

  const data: MeetingInvitationData = {
    meetingId: meeting.id,
    meetingType: meeting.meetingType,
    meetingStatus: meeting.status,
    scheduledAt: meeting.scheduledAt,
    location: meeting.location,
    requestReference: request?.reference ?? null,
    requestType: request?.requestType ?? null,
    organisationName: organisation?.name ?? null,
    contactName: contact?.fullName ?? null,
  };

  const html = buildMeetingInvitationHtml(data, { logo: await logoDataUri(), generatedAt: new Date() });
  return { pdf: await renderHtmlToPdf(html), fileName: invitationFileName(data) };
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
  attachment: PreparedAttachment
): Promise<MeetingView> {
  const target: RelocationTarget = { ownerType: 'meeting_report', ownerId: meetingId };
  const updated = await db.transaction(async (tx) => {
    const [meeting] = await tx.select().from(meetings).where(eq(meetings.id, meetingId)).for('update');
    if (!meeting) throw new Error('MEETING_NOT_FOUND');
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') return meeting;
    if (meeting.status !== 'held') throw new Error('MEETING_NOT_HELD');

    // VERSION-CURRENT-DISCIPLINE - unconditional, like every other owner
    // type's reference pattern: trashCurrentVersions is itself a no-op when
    // there is nothing current yet, so gating it on crDocumentUrl was
    // redundant and less defensive.
    await trashCurrentVersions(tx, 'meeting_report', meetingId);

    await tx.insert(documentVersions).values(versionValues(attachment, 'meeting_report', meetingId));
    await linkLockedAsset(tx, attachment.assetId, target);

    const [saved] = await tx
      .update(meetings)
      .set({ crDocumentUrl: attachment.fileUrl, crUploadedAt: new Date() })
      .where(eq(meetings.id, meetingId))
      .returning();

    await logAudit(
      { userId: actorUserId, action: 'MEETING_REPORT_ATTACHED', module: 'M3', entityId: meetingId },
      tx
    );
    return saved;
  });

  await relocateDossierAssetAfterCommit(attachment.assetId, target);
  return toMeetingView(updated);
}
