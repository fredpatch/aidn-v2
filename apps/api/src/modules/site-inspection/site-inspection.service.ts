import { eq, and, desc, ne } from 'drizzle-orm';
import { INSPECTION_BUCKETS, OPERATIONAL_OWNERS, canRecordSiteVisitHeld, countBuckets, visitDayUrgency } from '@aidn/shared';
import { db } from '../../shared/db/index.js';
import {
  phases,
  requests,
  organisations,
  payments,
  meetings,
  siteInspections,
  users,
} from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import type { PreparedAttachment } from '../uploads/upload-attachment.js';
import { attachPaymentInvoice, attachPaymentProof } from '../payments/payment-documents.js';
import { scheduleMeeting } from '../meetings/meetings.service.js';
import type {
  PaymentView,
  SiteVisitView,
  InspectionView,
  SiteInspectionBundle,
  InspectionQueueItem,
  InspectionQueueResponse,
} from './site-inspection.types.js';
import { rejectPhasePayment, validatePhasePayment } from '../payments/payment-decisions.js';
import { assertDossierOpen, assertMeetingDossierOpen, assertPhaseDossierOpen, dossierFlags } from '../requests/dossier-open.js';

function toPaymentView(row: typeof payments.$inferSelect): PaymentView {
  return {
    id: row.id,
    status: row.status,
    invoiceFileUrl: row.invoiceFileUrl,
    invoiceUploadedAt: row.invoiceUploadedAt,
    proofFileUrl: row.proofFileUrl,
    proofUploadedAt: row.proofUploadedAt,
    validatedAt: row.validatedAt,
    rejectionReason: row.rejectionReason,
    rejectionAction: row.rejectionAction,
  };
}

function toSiteVisitView(row: typeof meetings.$inferSelect): SiteVisitView {
  return {
    id: row.id,
    r3AgentId: row.dnAgentId, // generic FK column, holds the assigned r3_agent for site_visit meetings
    scheduledAt: row.scheduledAt,
    location: row.location,
    status: row.status,
  };
}

function toInspectionView(row: typeof siteInspections.$inferSelect): InspectionView {
  return {
    id: row.id,
    r3AgentId: row.r3AgentId,
    verdict: row.verdict,
    note: row.note,
    submittedAt: row.submittedAt,
  };
}

// ── Open M6 ───────────────────────────────────────────────────────────────
export async function openSiteInspectionPhase(
  requestId: number,
  actorUserId: number
): Promise<{ id: number }> {
  // K7 - closed dossier: read-only (requests/dossier-open.ts).
  await assertDossierOpen(db, requestId);
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');

  const [m5] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M5')));
  if (!m5 || m5.status !== 'closed') throw new Error('M5_NOT_CLOSED');

  const [existing] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M6')));
  if (existing) throw new Error('PHASE_ALREADY_OPEN');

  const [phase] = await db.insert(phases).values({ requestId, phaseCode: 'M6' }).returning();

  await db.insert(payments).values({ phaseId: phase.id });

  await logAudit({
    userId: actorUserId,
    action: 'PHASE_OPENED',
    module: 'M6',
    entityId: phase.id,
    details: { requestId, phaseCode: 'M6' },
  });

  return { id: phase.id };
}

// ── Bundle ────────────────────────────────────────────────────────────────
export async function getBundleForRequest(requestId: number): Promise<SiteInspectionBundle> {
  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M6')));

  if (!phase) {
    return { phase: null, payment: null, siteVisit: null, inspection: null };
  }

  const [payment] = await db.select().from(payments).where(eq(payments.phaseId, phase.id));

  // Current visit only: a reschedule leaves the old row as 'rescheduled' and
  // inserts a new one - same rule as the M3/M4 bundles.
  const [siteVisitRow] = await db
    .select()
    .from(meetings)
    .where(
      and(
        eq(meetings.phaseId, phase.id),
        eq(meetings.meetingType, 'site_visit'),
        ne(meetings.status, 'rescheduled')
      )
    )
    .orderBy(desc(meetings.scheduledAt));

  const [inspectionRow] = await db
    .select()
    .from(siteInspections)
    .where(eq(siteInspections.phaseId, phase.id));

  return {
    phase: {
      id: phase.id,
      status: phase.status,
      openedAt: phase.openedAt,
      closedAt: phase.closedAt,
    },
    payment: payment ? toPaymentView(payment) : null,
    siteVisit: siteVisitRow ? toSiteVisitView(siteVisitRow) : null,
    inspection: inspectionRow ? toInspectionView(inspectionRow) : null,
  };
}

export async function assertR3AssignedToRequest(
  requestId: number,
  r3AgentId: number
): Promise<void> {
  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M6')));
  if (!phase) throw new Error('PHASE_NOT_FOUND');

  const [siteVisit] = await db
    .select()
    .from(meetings)
    .where(
      and(
        eq(meetings.phaseId, phase.id),
        eq(meetings.meetingType, 'site_visit'),
        eq(meetings.dnAgentId, r3AgentId),
        // Access follows the current visit, not a superseded one.
        ne(meetings.status, 'rescheduled')
      )
    );
  if (!siteVisit) throw new Error('SITE_VISIT_NOT_ASSIGNED');
}

// ── Invoice ───────────────────────────────────────────────────────────────
export async function uploadInvoice(
  phaseId: number,
  attachment: PreparedAttachment,
  actorUserId: number
): Promise<PaymentView> {
  return toPaymentView(await attachPaymentInvoice(phaseId, 'M6', attachment, actorUserId));
}

// ── Proof of payment ─────────────────────────────────────────────────────
export async function uploadPaymentProof(
  phaseId: number,
  requestId: number,
  applicantId: number,
  attachment: PreparedAttachment
): Promise<PaymentView> {
  return toPaymentView(await attachPaymentProof(phaseId, requestId, applicantId, 'M6', attachment));
}

// ── Validate / reject proof ──────────────────────────────────────────────
export async function validatePayment(phaseId: number, actorUserId: number): Promise<PaymentView> {
  // K5 - one transaction, row locked, phase checked to be M6.
  return toPaymentView(await validatePhasePayment({ phaseId, phaseCode: 'M6', actorUserId }));
}

export async function rejectPayment(
  phaseId: number,
  actorUserId: number,
  rejectionAction: 'request_new_proof' | 'reject_dossier',
  rejectionReason: string
): Promise<PaymentView> {
  // K4 - one transaction, row locked, phase checked to be M6.
  const updated = await rejectPhasePayment({ phaseId, phaseCode: 'M6', actorUserId, rejectionAction, rejectionReason });
  return toPaymentView(updated);
}

// ── Site visit scheduling - wraps the shared meetings module ────────────
export async function scheduleSiteVisit(params: {
  phaseId: number;
  r3AgentId: number;
  scheduledAt: string;
  location?: string;
  /** Who schedules (audit); r3AgentId is who is assigned. */
  actorUserId: number;
}): Promise<{ meeting: SiteVisitView; softOverlapWarning: boolean }> {
  const { meeting, softOverlapWarning } = await scheduleMeeting({
    phaseId: params.phaseId,
    meetingType: 'site_visit',
    actorUserId: params.actorUserId,
    dnAgentId: params.r3AgentId,
    scheduledAt: params.scheduledAt,
    location: params.location,
  });

  return {
    meeting: {
      id: meeting.id,
      r3AgentId: meeting.dnAgentId,
      scheduledAt: meeting.scheduledAt,
      location: meeting.location,
      status: meeting.status,
    },
    softOverlapWarning,
  };
}

export async function markAssignedSiteVisitHeld(
  meetingId: number,
  r3AgentId: number
): Promise<SiteVisitView> {
  // K7 - closed dossier: read-only (requests/dossier-open.ts).
  await assertMeetingDossierOpen(db, meetingId);
  const [row] = await db
    .select({ visit: meetings, payment: payments })
    .from(meetings)
    .leftJoin(payments, eq(payments.phaseId, meetings.phaseId))
    .where(and(eq(meetings.id, meetingId), eq(meetings.meetingType, 'site_visit'), eq(meetings.dnAgentId, r3AgentId)));
  if (!row) throw new Error('SITE_VISIT_NOT_ASSIGNED');
  if (row.visit.status !== 'scheduled') throw new Error('MEETING_NOT_SCHEDULED');
  // B4 - a visit is recorded as held only once its M6 payment is validated.
  if (!canRecordSiteVisitHeld(row.visit, row.payment)) throw new Error('SITE_VISIT_PAYMENT_NOT_VALIDATED');

  // Compare-and-set: a concurrent call that already moved the visit gets no row.
  const [updated] = await db
    .update(meetings)
    .set({ status: 'held' })
    .where(and(eq(meetings.id, meetingId), eq(meetings.status, 'scheduled')))
    .returning();
  if (!updated) throw new Error('MEETING_NOT_SCHEDULED');

  await logAudit({
    userId: r3AgentId,
    action: 'SITE_VISIT_HELD',
    module: 'M6',
    entityId: meetingId,
  });

  return toSiteVisitView(updated);
}

// ── R3 verdict - single submission, auto-closes the phase ───────────────
/** BUG-M6-VERDICT-ATOMIC-1 - one transaction: opinion, M6 closure and both
 *  audit rows commit together or not at all. The M6 phase row is locked
 *  first (site_inspections has no unique phase_id): a concurrent submission
 *  waits, then sees the committed opinion and gets VERDICT_ALREADY_SUBMITTED
 *  (checked before PHASE_ALREADY_CLOSED, which stays the answer for an M6
 *  closed without an opinion). One timestamp for the opinion and the closure
 *  (phases.closed_at is the analytics opinion time, ROLE-ANALYTICS-1E). */
export async function submitInspectionVerdict(
  phaseId: number,
  r3AgentId: number,
  verdict: 'compliant' | 'non_compliant' | 'compliant_with_reserves',
  note: string
): Promise<InspectionView> {
  const inspection = await db.transaction(async (tx) => {
    // K7 - closed dossier: read-only (requests/dossier-open.ts).
    await assertPhaseDossierOpen(tx, phaseId);
    const [phase] = await tx.select().from(phases).where(eq(phases.id, phaseId)).for('update');
    if (!phase) throw new Error('PHASE_NOT_FOUND');

    const [existing] = await tx
      .select({ id: siteInspections.id })
      .from(siteInspections)
      .where(eq(siteInspections.phaseId, phaseId));
    if (existing) throw new Error('VERDICT_ALREADY_SUBMITTED');
    if (phase.status !== 'open') throw new Error('PHASE_ALREADY_CLOSED');

    const [payment] = await tx.select().from(payments).where(eq(payments.phaseId, phaseId));
    if (!payment || payment.status !== 'validated') throw new Error('PAYMENT_NOT_VALIDATED');

    // Current visit only: after a reschedule the superseded row stays as
    // 'rescheduled' and must not be the one checked for 'held'.
    const [siteVisit] = await tx
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.phaseId, phaseId),
          eq(meetings.meetingType, 'site_visit'),
          ne(meetings.status, 'rescheduled')
        )
      )
      .orderBy(desc(meetings.scheduledAt));
    if (!siteVisit) throw new Error('SITE_VISIT_NOT_SCHEDULED');
    if (siteVisit.dnAgentId !== r3AgentId) throw new Error('SITE_VISIT_NOT_ASSIGNED');
    if (siteVisit.status !== 'held') throw new Error('SITE_VISIT_NOT_HELD');

    const submittedAt = new Date();
    const [created] = await tx
      .insert(siteInspections)
      .values({ phaseId, meetingId: siteVisit.id, r3AgentId, verdict, note, submittedAt })
      .returning();

    // Auto-close: per M6 spec, no DN decision is required once R3's verdict
    // lands - closure happens immediately as part of this same action.
    await tx
      .update(phases)
      .set({ status: 'closed', closedAt: submittedAt })
      .where(eq(phases.id, phaseId));

    await logAudit(
      {
        userId: r3AgentId,
        action: 'INSPECTION_VERDICT_SUBMITTED',
        module: 'M6',
        entityId: created.id,
        details: { verdict },
      },
      tx
    );

    await logAudit(
      {
        userId: r3AgentId,
        action: 'PHASE_CLOSED',
        module: 'M6',
        entityId: phaseId,
        details: { trigger: 'auto_on_verdict' },
      },
      tx
    );
    return created;
  });

  return toInspectionView(inspection);
}

// ── Cellule Inspection queue (read model) ────────────────────────────────
type QueueRow = {
  phaseId: number; phaseStatus: string; requestId: number; requestReference: string; requestType: string;
  requestStatus: string; organisationName: string; agentName: string | null;
  payment: typeof payments.$inferSelect | null; siteVisit: typeof meetings.$inferSelect; inspection: typeof siteInspections.$inferSelect | null;
};
type Op = Pick<InspectionQueueItem, 'bucket' | 'state' | 'owner' | 'actionKey' | 'blockReason' | 'urgency' | 'dueAt'>;

export function buildInspectionItem(row: QueueRow, viewerId: number, now: Date): InspectionQueueItem {
  const flags = dossierFlags(row.requestStatus);
  const done = (bucket: 'closed' | 'inactive', blockReason: Op['blockReason']): Op => ({
    bucket, state: 'done', owner: null, actionKey: 'none', blockReason, urgency: 'normal', dueAt: null,
  });
  let op: Op;
  if (flags.dossierClosed) op = done('inactive', 'dossier_closed');
  else if (row.inspection || row.phaseStatus === 'closed') op = done('closed', null);
  else if (row.payment?.status !== 'validated') {
    op = {
      bucket: 'awaiting_payment', state: 'blocked', actionKey: 'await_payment', blockReason: 'payment_not_validated', urgency: 'normal', dueAt: null,
      owner: row.payment?.status === 'awaiting_proof' ? OPERATIONAL_OWNERS.applicant : OPERATIONAL_OWNERS.finance,
    };
  } else if (canRecordSiteVisitHeld(row.siteVisit, row.payment)) {
    op = {
      bucket: 'to_hold', state: 'action_required', owner: OPERATIONAL_OWNERS.inspection, actionKey: 'record_visit_held', blockReason: null,
      urgency: visitDayUrgency(row.siteVisit.scheduledAt, now), dueAt: row.siteVisit.scheduledAt.toISOString(),
    };
  } else if (row.siteVisit.status === 'held') {
    op = { bucket: 'verdict_due', state: 'action_required', owner: OPERATIONAL_OWNERS.inspection, actionKey: 'submit_verdict', blockReason: null, urgency: 'normal', dueAt: null };
  } else op = done('inactive', null); // no_show, file_cancelled...
  return {
    id: `site_visit:${row.siteVisit.id}`,
    requestId: row.requestId,
    requestReference: row.requestReference,
    organisationName: row.organisationName,
    ...op,
    stepSince: (row.inspection?.submittedAt ?? row.siteVisit.scheduledAt).toISOString(),
    ...flags,
    phaseId: row.phaseId,
    phaseStatus: row.phaseStatus,
    requestType: row.requestType,
    payment: row.payment ? toPaymentView(row.payment) : null,
    siteVisit: toSiteVisitView(row.siteVisit),
    inspection: row.inspection ? toInspectionView(row.inspection) : null,
    assignedToViewer: row.siteVisit.dnAgentId === viewerId,
    assignedAgentName: row.agentName,
  };
}

/** D14 - an agent sees the missions assigned to them; SU sees every mission.
 *  One query either way. */
export async function getMyQueue(viewer: { userId: number; roles: readonly string[] }, now: Date = new Date()): Promise<InspectionQueueResponse> {
  const seeAll = viewer.roles.includes('SU');
  const rows = await db
    .select({
      phaseId: phases.id,
      phaseStatus: phases.status,
      requestId: requests.id,
      requestReference: requests.reference,
      requestType: requests.requestType,
      requestStatus: requests.status,
      organisationName: organisations.name,
      agentName: users.fullName,
      payment: payments,
      siteVisit: meetings,
      inspection: siteInspections,
    })
    .from(meetings)
    .innerJoin(phases, eq(meetings.phaseId, phases.id))
    .innerJoin(requests, eq(phases.requestId, requests.id))
    .innerJoin(organisations, eq(requests.organisationId, organisations.id))
    .leftJoin(users, eq(users.id, meetings.dnAgentId))
    .leftJoin(payments, eq(payments.phaseId, phases.id))
    .leftJoin(siteInspections, eq(siteInspections.phaseId, phases.id))
    .where(
      and(
        eq(phases.phaseCode, 'M6'),
        eq(meetings.meetingType, 'site_visit'),
        // One row per dossier: a superseded visit would list it twice.
        ne(meetings.status, 'rescheduled'),
        seeAll ? undefined : eq(meetings.dnAgentId, viewer.userId)
      )
    )
    .orderBy(desc(meetings.scheduledAt));
  const items = rows.map((row) => buildInspectionItem(row, viewer.userId, now));
  return { items, counts: countBuckets(INSPECTION_BUCKETS, items) };
}
