import { eq, and, gte, inArray, lt, notInArray, type SQL } from 'drizzle-orm';
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
  StaffMeetingView,
} from './meetings.types.js';
import { lacksMeetingReport } from './meeting-follow-up.js';
import {
  assertMeetingDossierOpen,
  assertPhaseDossierOpen,
  CLOSED_DOSSIER_STATUSES,
  dossierFlags,
  isDossierClosed,
} from '../requests/dossier-open.js';
import {
  initialConfirmationStatus,
  isAwaitingApplicant,
  isAwaitingDn,
  isConfirmedScheduledMeeting,
  isMeetingOperationallyConfirmed,
  requiresApplicantConfirmation,
} from './meeting-confirmation.js';
import {
  applicantBlocksFor,
  negotiationViewsFor,
  type MeetingNegotiationView,
} from './meeting-negotiation.view.js';
import { appendNegotiationEvent } from './meeting-negotiation.events.js';
import { hasSameDayMeeting, insertMeetingRow, lockMeeting, parseSlot, phaseCodeOf } from './meeting-write.js';

export type { ScheduleMeetingParams, MeetingView } from './meetings.types.js';

function toMeetingView(row: typeof meetings.$inferSelect): MeetingView {
  return {
    id: row.id,
    phaseId: row.phaseId,
    meetingType: row.meetingType,
    dnAgentId: row.dnAgentId,
    scheduledAt: row.scheduledAt,
    location: row.location,
    status: row.status,
    confirmationStatus: row.confirmationStatus,
    confirmedAt: row.confirmedAt,
    crDocumentUrl: row.crDocumentUrl,
    crUploadedAt: row.crUploadedAt,
    createdAt: row.createdAt,
  };
}

const PHASE_LABELS: Record<string, string> = {
  M3: 'Préliminaire',
  M4: 'Demande formelle',
  M5: 'Évaluation approfondie',
  M6: 'Démonstration / Inspection',
  M7: 'Délivrance',
};

const MEETING_TYPE_LABELS: Record<string, string> = {
  preliminary: 'Réunion préliminaire',
  formal: 'Réunion formelle',
  site_visit: 'Visite sur site',
};

const MEETING_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Planifiée',
  held: 'Tenue',
  no_show: 'Absence',
  rescheduled: 'Reprogrammee',
  file_cancelled: 'Dossier annulé',
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
  if (!canManageMeeting(row.meetingType)) return 'Suivi inspection';
  if (row.status === 'scheduled' && isAwaitingDn(row)) return 'Répondre à la contre-proposition';
  if (row.status === 'scheduled' && isAwaitingApplicant(row)) return 'En attente du postulant';
  if (row.status === 'scheduled') return 'Résoudre la réunion';
  if (row.status === 'held' && !row.crDocumentUrl) return 'Compte-rendu facultatif';
  if (row.status === 'held' && row.crDocumentUrl) return 'Compte-rendu déposé';
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

interface CockpitRow {
  meeting: typeof meetings.$inferSelect;
  phase: typeof phases.$inferSelect;
  request: typeof requests.$inferSelect;
  organisation: typeof organisations.$inferSelect;
  applicant: typeof applicants.$inferSelect;
  agent: typeof users.$inferSelect;
}

function toCockpitItem(row: CockpitRow, negotiation: MeetingNegotiationView): MeetingCockpitItem {
  // K7c - a closed dossier's meetings stay listed for history, without action.
  const flags = dossierFlags(row.request.status);
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
    canManage: !flags.dossierClosed && canManageMeeting(row.meeting.meetingType),
    actionLabel: flags.dossierClosed ? 'Dossier clos' : meetingActionLabel(row.meeting),
    negotiation,
    ...flags,
  };
}

async function cockpitRows(conditions: SQL[]): Promise<CockpitRow[]> {
  return db
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
}

async function toCockpitItems(rows: CockpitRow[]): Promise<MeetingCockpitItem[]> {
  const closedById = new Map(rows.map((row) => [row.meeting.id, isDossierClosed(row.request.status)]));
  const views = await negotiationViewsFor(
    rows.map((row) => row.meeting),
    (meeting) => closedById.get(meeting.id) ?? true
  );
  return rows.map((row) => toCockpitItem(row, views.get(row.meeting.id)!));
}

const CONFIRMATION_FILTERS = ['awaiting_applicant', 'awaiting_dn', 'confirmed', 'not_required'] as const;

export async function listMeetingCockpit(params: {
  from?: string;
  to?: string;
  meetingType?: string;
  status?: string;
  phaseCode?: string;
  confirmation?: string;
}): Promise<MeetingCockpitSummary> {
  const now = new Date();
  const periodStart = params.from ? new Date(params.from) : startOfDay(now);
  const periodEnd = params.to ? new Date(params.to) : addDays(periodStart, 7);

  const conditions: SQL[] = [gte(meetings.scheduledAt, periodStart), lt(meetings.scheduledAt, periodEnd)];
  if (params.meetingType && params.meetingType !== 'all') {
    conditions.push(eq(meetings.meetingType, params.meetingType as typeof meetings.$inferSelect['meetingType']));
  }
  if (params.status && params.status !== 'all') {
    conditions.push(eq(meetings.status, params.status as typeof meetings.$inferSelect['status']));
  }
  if (params.phaseCode && params.phaseCode !== 'all') {
    conditions.push(eq(phases.phaseCode, params.phaseCode as typeof phases.$inferSelect['phaseCode']));
  }
  const confirmation = CONFIRMATION_FILTERS.find((value) => value === params.confirmation);
  if (confirmation) conditions.push(eq(meetings.confirmationStatus, confirmation));

  // SESSION1-MEET-1 - what waits on someone is listed whatever its date: a
  // counter-proposal for a meeting in three weeks must not hide outside the
  // default 7-day window. Live meetings of open dossiers only (K7d).
  const [rows, pendingRows] = await Promise.all([
    cockpitRows(conditions),
    cockpitRows([
      eq(meetings.status, 'scheduled'),
      inArray(meetings.confirmationStatus, ['awaiting_applicant', 'awaiting_dn']),
      notInArray(requests.status, CLOSED_DOSSIER_STATUSES as (typeof requests.$inferSelect)['status'][]),
    ]),
  ]);

  const [items, pendingItems] = await Promise.all([toCockpitItems(rows), toCockpitItems(pendingRows)]);
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  // Upcoming / today: confirmed and unconfirmed slots alike - each item
  // carries its negotiation state, so the screen can tell them apart.
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
  const confirmedPlanned = rows.filter((row) => isConfirmedScheduledMeeting(row.meeting));
  const counterProposalIds = new Set(pendingRows.filter((row) => isAwaitingDn(row.meeting)).map((row) => row.meeting.id));
  const awaitingApplicantCount = pendingRows.filter((row) => isAwaitingApplicant(row.meeting)).length;
  // Counter-proposals first (the DN must act), then the longest waiting.
  const pendingNegotiations = [...pendingItems].sort(
    (a, b) =>
      Number(counterProposalIds.has(b.id)) - Number(counterProposalIds.has(a.id)) ||
      (a.negotiation.waitingSince ?? '').localeCompare(b.negotiation.waitingSince ?? '')
  );

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    metrics: [
      {
        key: 'scheduled',
        label: 'Réunions prévues',
        value: confirmedPlanned.length,
        helper: 'Rendez-vous confirmés sur la période',
        tone: 'info',
      },
      {
        key: 'counter_proposals',
        label: 'Contre-propositions à traiter',
        value: counterProposalIds.size,
        helper: 'Nouvelles dates proposées par les postulants',
        tone: counterProposalIds.size > 0 ? 'warning' : 'success',
      },
      {
        key: 'awaiting_applicant',
        label: 'En attente du postulant',
        value: awaitingApplicantCount,
        helper: 'Rendez-vous proposés, pas encore confirmés',
        tone: 'info',
      },
      {
        key: 'today',
        label: "Aujourd'hui",
        value: todayMeetings.length,
        helper: 'Réunions au calendrier du jour',
        tone: todayMeetings.length > 0 ? 'warning' : 'success',
      },
      {
        key: 'missing_reports',
        label: 'Comptes-rendus manquants',
        value: missingReports.length,
        helper: 'Facultatif - réunions tenues sans compte-rendu',
        // K6 - optional document: information, never an alert (Fred).
        tone: 'info',
      },
      {
        key: 'held',
        label: 'Réunions tenues',
        value: heldThisPeriod.length,
        helper: 'Réunions marquées tenues',
        tone: 'success',
      },
    ],
    items,
    upcoming,
    missingReports,
    pendingNegotiations,
    updatedAt: now.toISOString(),
  };
}

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

  const closedById = new Map(rows.map(({ meeting, request }) => [meeting.id, isDossierClosed(request.status)]));
  const blocks = await applicantBlocksFor(
    rows.map(({ meeting }) => meeting),
    (meeting) => closedById.get(meeting.id) ?? true
  );

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
    ...blocks.get(meeting.id)!,
  }));
}

/** A new DN proposal (M3/M4: awaiting the applicant, with a dn_proposed
 *  event) or a site visit (M6: not_required). One transaction.
 *  The acting user (audit) is kept apart from the assigned agent. */
export async function scheduleMeeting(
  params: ScheduleMeetingParams
): Promise<{ meeting: MeetingView; softOverlapWarning: boolean }> {
  const scheduledAt = parseSlot(params.scheduledAt);
  return db.transaction(async (tx) => {
    // K7 - closed dossier: read-only (requests/dossier-open.ts).
    await assertPhaseDossierOpen(tx, params.phaseId);
    const [phase] = await tx.select().from(phases).where(eq(phases.id, params.phaseId));
    if (!phase) throw new Error('PHASE_NOT_FOUND');
    if (phase.status !== 'open') throw new Error('PHASE_NOT_OPEN');

    if (params.meetingType === 'formal') {
      const [letterCircuit] = await tx
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

    const softOverlapWarning = await hasSameDayMeeting(tx, params.dnAgentId, scheduledAt);
    const meeting = await insertMeetingRow(tx, {
      phaseId: params.phaseId,
      meetingType: params.meetingType,
      dnAgentId: params.dnAgentId,
      scheduledAt,
      location: params.location,
      status: 'scheduled',
      confirmationStatus: initialConfirmationStatus(params.meetingType),
    });
    if (requiresApplicantConfirmation(params.meetingType)) {
      await appendNegotiationEvent(tx, {
        meetingId: meeting.id,
        kind: 'dn_proposed',
        actor: { userId: params.actorUserId },
        slotAt: scheduledAt,
      });
    }

    await logAudit(
      {
        userId: params.actorUserId,
        action: 'MEETING_SCHEDULED',
        module: phase.phaseCode,
        entityId: meeting.id,
        details: { dnAgentId: params.dnAgentId },
      },
      tx
    );

    return { meeting: toMeetingView(meeting), softOverlapWarning };
  });
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
): Promise<StaffMeetingView | ApplicantMeetingView> {
  const { meeting, request } = await getMeetingForAuthorizedActor(meetingId, actor);
  const view = toMeetingView(meeting);
  const closed = () => isDossierClosed(request?.status ?? 'cancelled');
  if (actor.applicant) {
    const blocks = await applicantBlocksFor([meeting], closed);
    return toApplicantMeetingView(view, blocks.get(meeting.id)!);
  }
  const negotiation = await negotiationViewsFor([meeting], closed, { withPhaseHistory: true });
  return { ...view, negotiation: negotiation.get(meeting.id)! };
}

/** Invitation PDF (Batch L - replaces the earlier plain HTML ticket).
 *  Consumes the same authorized meeting/context as getMeeting
 *  (MEETINGS-IDOR) - no independent unscoped refetch by id. */
export async function getMeetingInvitationPdf(
  meetingId: number,
  actor: MeetingActor
): Promise<{ pdf: Buffer; fileName: string }> {
  const { meeting, request } = await getMeetingForAuthorizedActor(meetingId, actor);
  // SESSION1-MEET-1 - no final invitation for an appointment never confirmed.
  if (!isMeetingOperationallyConfirmed(meeting)) throw new Error('MEETING_INVITATION_NOT_CONFIRMED');
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
  return db.transaction(async (tx) => {
    // K7 - closed dossier: read-only (requests/dossier-open.ts).
    const meeting = await lockMeeting(tx, meetingId);
    if (meeting.status !== 'scheduled') throw new Error('MEETING_NOT_SCHEDULED');
    // SESSION1-MEET-1 - nobody is marked absent from an appointment they never confirmed.
    if (!isMeetingOperationallyConfirmed(meeting)) throw new Error('MEETING_NOT_CONFIRMED');

    const [updated] = await tx.update(meetings).set({ status }).where(eq(meetings.id, meetingId)).returning();

    const [phase] = await tx.select().from(phases).where(eq(phases.id, meeting.phaseId));
    if (!phase) throw new Error('PHASE_NOT_FOUND');
    if (status === 'file_cancelled') {
      await tx
        .update(requests)
        .set({
          status: 'rejected',
          rejectionReason: 'Dossier annulé suite à absence non justifiée (réunion).',
        })
        .where(eq(requests.id, phase.requestId));
    }

    await logAudit(
      { userId: actorUserId, action: `MEETING_${status.toUpperCase()}`, module: phase.phaseCode, entityId: meetingId },
      tx
    );
    return toMeetingView(updated);
  });
}

/** DN moves a live meeting to a new slot, in ONE transaction: the
 *  replacement row is inserted first (a slot conflict rolls everything back
 *  and the original keeps its slot), then the old row becomes 'rescheduled'
 *  (frozen as it was). M3/M4: the replacement is a NEW proposal the applicant
 *  must confirm again, even if the old slot was confirmed. M6: not_required. */
export async function rescheduleMeeting(
  meetingId: number,
  actorUserId: number,
  newScheduledAt: string,
  remark?: string
): Promise<{ meeting: MeetingView; softOverlapWarning: boolean }> {
  const scheduledAt = parseSlot(newScheduledAt);
  return db.transaction(async (tx) => {
    // K7 - closed dossier: read-only (requests/dossier-open.ts).
    const oldMeeting = await lockMeeting(tx, meetingId);
    if (oldMeeting.status !== 'scheduled') throw new Error('MEETING_NOT_SCHEDULED');
    if (scheduledAt.getTime() === oldMeeting.scheduledAt.getTime()) throw new Error('RESCHEDULE_SAME_SLOT');
    const module = await phaseCodeOf(tx, oldMeeting.phaseId);

    const softOverlapWarning = await hasSameDayMeeting(tx, oldMeeting.dnAgentId, scheduledAt, oldMeeting.id);
    const replacement = await insertMeetingRow(tx, {
      phaseId: oldMeeting.phaseId,
      meetingType: oldMeeting.meetingType,
      dnAgentId: oldMeeting.dnAgentId,
      scheduledAt,
      location: oldMeeting.location,
      status: 'scheduled',
      confirmationStatus: initialConfirmationStatus(oldMeeting.meetingType),
    });
    await tx.update(meetings).set({ status: 'rescheduled' }).where(eq(meetings.id, meetingId));

    if (requiresApplicantConfirmation(oldMeeting.meetingType)) {
      const actor = { userId: actorUserId };
      await appendNegotiationEvent(tx, {
        meetingId: oldMeeting.id,
        kind: 'dn_rescheduled',
        actor,
        slotAt: scheduledAt,
        remark: remark?.trim() || null,
        resultingMeetingId: replacement.id,
      });
      await appendNegotiationEvent(tx, { meetingId: replacement.id, kind: 'dn_proposed', actor, slotAt: scheduledAt });
    }

    await logAudit(
      {
        userId: actorUserId,
        action: 'MEETING_RESCHEDULED',
        module,
        entityId: meetingId,
        details: { newMeetingId: replacement.id },
      },
      tx
    );
    return { meeting: toMeetingView(replacement), softOverlapWarning };
  });
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
    // K7 - closed dossier: read-only (requests/dossier-open.ts).
    await assertMeetingDossierOpen(tx, meetingId);
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
      {
        userId: actorUserId,
        action: 'MEETING_REPORT_ATTACHED',
        module: await phaseCodeOf(tx, meeting.phaseId),
        entityId: meetingId,
      },
      tx
    );
    return saved;
  });

  await relocateDossierAssetAfterCommit(attachment.assetId, target);
  return toMeetingView(updated);
}
