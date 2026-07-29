import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import {
  phases,
  requests,
  organisations,
  payments,
  meetings,
  siteInspections,
  documentVersions,
} from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { linkUploadAssetToOwner } from '../uploads/uploads.service.js';
import { scheduleMeeting } from '../meetings/meetings.service.js';
import type {
  PaymentView,
  SiteVisitView,
  InspectionView,
  SiteInspectionBundle,
  MyQueueItem,
  PaymentQueueItem,
} from './site-inspection.types.js';

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

function nextPaymentAction(status: string): PaymentQueueItem['nextAction'] {
  if (status === 'awaiting_invoice') return 'send_invoice';
  if (status === 'pending_validation') return 'validate_payment';
  if (status === 'awaiting_proof') return 'waiting_for_proof';
  if (status === 'validated') return 'done';
  return 'rejected';
}

function daysBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function missionState(params: {
  phaseStatus: string;
  payment: typeof payments.$inferSelect | null;
  siteVisit: typeof meetings.$inferSelect;
  inspection: typeof siteInspections.$inferSelect | null;
}): Pick<
  MyQueueItem,
  'missionStatus' | 'statusLabel' | 'nextAction' | 'nextActionLabel' | 'priority' | 'waitingDays'
> {
  const waitingDays = daysBetween(params.siteVisit.scheduledAt, new Date());
  if (params.inspection || params.phaseStatus === 'closed') {
    return {
      missionStatus: 'closed',
      statusLabel: 'Cloturee',
      nextAction: 'consult',
      nextActionLabel: 'Consulter',
      priority: 'basse',
      waitingDays,
    };
  }
  if (!params.payment || params.payment.status !== 'validated') {
    return {
      missionStatus: 'payment_pending',
      statusLabel: 'Paiement attendu',
      nextAction: 'wait_payment',
      nextActionLabel: 'Suivre',
      priority: 'basse',
      waitingDays,
    };
  }
  if (params.siteVisit.status === 'scheduled') {
    const today = new Date();
    const scheduledDay = new Date(params.siteVisit.scheduledAt);
    scheduledDay.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const daysUntil = Math.ceil(
      (scheduledDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      missionStatus: 'to_hold',
      statusLabel: 'Prevue',
      nextAction: 'mark_held',
      nextActionLabel: 'Marquer tenue',
      priority: daysUntil <= 0 ? 'haute' : daysUntil <= 2 ? 'moyenne' : 'basse',
      waitingDays,
    };
  }
  if (params.siteVisit.status === 'held') {
    return {
      missionStatus: 'report_due',
      statusLabel: 'Avis attendu',
      nextAction: 'submit_verdict',
      nextActionLabel: "Soumettre l'avis",
      priority: 'haute',
      waitingDays,
    };
  }
  return {
    missionStatus: 'planned',
    statusLabel: params.siteVisit.status,
    nextAction: 'consult',
    nextActionLabel: 'Consulter',
    priority: 'basse',
    waitingDays,
  };
}

// ── Open M6 ───────────────────────────────────────────────────────────────
export async function openSiteInspectionPhase(
  requestId: number,
  actorUserId: number
): Promise<{ id: number }> {
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

  const [siteVisitRow] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.phaseId, phase.id), eq(meetings.meetingType, 'site_visit')))
    .orderBy(meetings.scheduledAt);

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
        eq(meetings.dnAgentId, r3AgentId)
      )
    );
  if (!siteVisit) throw new Error('SITE_VISIT_NOT_ASSIGNED');
}

export async function getPaymentQueue(): Promise<PaymentQueueItem[]> {
  const rows = await db
    .select({
      phaseId: phases.id,
      requestId: requests.id,
      requestReference: requests.reference,
      requestType: requests.requestType,
      organisationName: organisations.name,
      payment: payments,
    })
    .from(phases)
    .innerJoin(requests, eq(phases.requestId, requests.id))
    .innerJoin(organisations, eq(requests.organisationId, organisations.id))
    .innerJoin(payments, eq(payments.phaseId, phases.id))
    .where(eq(phases.phaseCode, 'M6'))
    .orderBy(desc(phases.openedAt));

  return rows.map((row) => ({
    phaseId: row.phaseId,
    requestId: row.requestId,
    requestReference: row.requestReference,
    requestType: row.requestType,
    organisationName: row.organisationName,
    payment: toPaymentView(row.payment),
    nextAction: nextPaymentAction(row.payment.status),
  }));
}

// ── Invoice ───────────────────────────────────────────────────────────────
export async function uploadInvoice(
  phaseId: number,
  fileUrl: string,
  mimeType: string,
  actorUserId: number,
  uploadAssetId?: number
): Promise<PaymentView> {
  const [payment] = await db.select().from(payments).where(eq(payments.phaseId, phaseId));
  if (!payment) throw new Error('PAYMENT_NOT_FOUND');

  await db.insert(documentVersions).values({
    ownerType: 'payment_invoice',
    ownerId: payment.id,
    fileUrl,
    mimeType,
    uploadedBy: actorUserId,
    isCurrent: true,
  });

  await linkUploadAssetToOwner({
    uploadAssetId,
    ownerType: 'payment_invoice',
    ownerId: payment.id,
    expectedFileUrl: fileUrl,
  });

  const [updated] = await db
    .update(payments)
    .set({ invoiceFileUrl: fileUrl, invoiceUploadedAt: new Date(), status: 'awaiting_proof' })
    .where(eq(payments.id, payment.id))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'INVOICE_UPLOADED',
    module: 'M6',
    entityId: payment.id,
  });

  return toPaymentView(updated);
}

// ── Proof of payment ─────────────────────────────────────────────────────
export async function uploadPaymentProof(
  phaseId: number,
  fileUrl: string,
  mimeType: string,
  actorUserId?: number,
  uploadAssetId?: number
): Promise<PaymentView> {
  const [payment] = await db.select().from(payments).where(eq(payments.phaseId, phaseId));
  if (!payment) throw new Error('PAYMENT_NOT_FOUND');
  if (!payment.invoiceFileUrl) throw new Error('INVOICE_NOT_UPLOADED');
  if (payment.status === 'validated') throw new Error('PAYMENT_ALREADY_VALIDATED');

  await db.insert(documentVersions).values({
    ownerType: 'payment_proof',
    ownerId: payment.id,
    fileUrl,
    mimeType,
    uploadedBy: actorUserId,
    isCurrent: true,
  });

  await linkUploadAssetToOwner({
    uploadAssetId,
    ownerType: 'payment_proof',
    ownerId: payment.id,
    expectedFileUrl: fileUrl,
  });

  const [updated] = await db
    .update(payments)
    .set({ proofFileUrl: fileUrl, proofUploadedAt: new Date(), status: 'pending_validation' })
    .where(eq(payments.id, payment.id))
    .returning();

  await logAudit({ action: 'PAYMENT_PROOF_UPLOADED', module: 'M6', entityId: payment.id });

  return toPaymentView(updated);
}

// ── Validate / reject proof ──────────────────────────────────────────────
export async function validatePayment(phaseId: number, actorUserId: number): Promise<PaymentView> {
  const [payment] = await db.select().from(payments).where(eq(payments.phaseId, phaseId));
  if (!payment) throw new Error('PAYMENT_NOT_FOUND');
  if (payment.status !== 'pending_validation') throw new Error('PAYMENT_NOT_PENDING');

  const [updated] = await db
    .update(payments)
    .set({ status: 'validated', validatedBy: actorUserId, validatedAt: new Date() })
    .where(eq(payments.id, payment.id))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'PAYMENT_VALIDATED',
    module: 'M6',
    entityId: payment.id,
  });

  return toPaymentView(updated);
}

export async function rejectPayment(
  phaseId: number,
  actorUserId: number,
  rejectionAction: 'request_new_proof' | 'reject_dossier',
  rejectionReason: string
): Promise<PaymentView> {
  const [payment] = await db.select().from(payments).where(eq(payments.phaseId, phaseId));
  if (!payment) throw new Error('PAYMENT_NOT_FOUND');
  if (payment.status !== 'pending_validation') throw new Error('PAYMENT_NOT_PENDING');

  const newStatus = rejectionAction === 'reject_dossier' ? 'rejected' : 'awaiting_proof';

  const [updated] = await db
    .update(payments)
    .set({ status: newStatus, rejectionAction, rejectionReason })
    .where(eq(payments.id, payment.id))
    .returning();

  if (rejectionAction === 'reject_dossier') {
    const [phase] = await db.select().from(phases).where(eq(phases.id, phaseId));
    if (phase) {
      await db
        .update(requests)
        .set({
          status: 'rejected',
          rejectionReason: `Paiement rejeté - dossier annulé : ${rejectionReason}`,
          updatedAt: new Date(),
        })
        .where(eq(requests.id, phase.requestId));
    }
  }

  await logAudit({
    userId: actorUserId,
    action: 'PAYMENT_REJECTED',
    module: 'M6',
    entityId: payment.id,
    details: { rejectionAction },
  });

  return toPaymentView(updated);
}

// ── Site visit scheduling - wraps the shared meetings module ────────────
export async function scheduleSiteVisit(params: {
  phaseId: number;
  r3AgentId: number;
  scheduledAt: string;
  location?: string;
}): Promise<{ meeting: SiteVisitView; softOverlapWarning: boolean }> {
  const { meeting, softOverlapWarning } = await scheduleMeeting({
    phaseId: params.phaseId,
    meetingType: 'site_visit',
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
  const [siteVisit] = await db
    .select()
    .from(meetings)
    .where(
      and(
        eq(meetings.id, meetingId),
        eq(meetings.meetingType, 'site_visit'),
        eq(meetings.dnAgentId, r3AgentId)
      )
    );
  if (!siteVisit) throw new Error('SITE_VISIT_NOT_ASSIGNED');
  if (siteVisit.status !== 'scheduled') throw new Error('MEETING_NOT_SCHEDULED');

  const [updated] = await db
    .update(meetings)
    .set({ status: 'held' })
    .where(eq(meetings.id, meetingId))
    .returning();

  await logAudit({
    userId: r3AgentId,
    action: 'SITE_VISIT_HELD',
    module: 'M6',
    entityId: meetingId,
  });

  return toSiteVisitView(updated);
}

// ── R3 verdict - single submission, auto-closes the phase ───────────────
export async function submitInspectionVerdict(
  phaseId: number,
  r3AgentId: number,
  verdict: 'compliant' | 'non_compliant' | 'compliant_with_reserves',
  note: string
): Promise<InspectionView> {
  const [phase] = await db.select().from(phases).where(eq(phases.id, phaseId));
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  if (phase.status !== 'open') throw new Error('PHASE_ALREADY_CLOSED');

  const [payment] = await db.select().from(payments).where(eq(payments.phaseId, phaseId));
  if (!payment || payment.status !== 'validated') throw new Error('PAYMENT_NOT_VALIDATED');

  const [siteVisit] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.phaseId, phaseId), eq(meetings.meetingType, 'site_visit')));
  if (!siteVisit) throw new Error('SITE_VISIT_NOT_SCHEDULED');
  if (siteVisit.dnAgentId !== r3AgentId) throw new Error('SITE_VISIT_NOT_ASSIGNED');
  if (siteVisit.status !== 'held') throw new Error('SITE_VISIT_NOT_HELD');

  const [existing] = await db
    .select()
    .from(siteInspections)
    .where(eq(siteInspections.phaseId, phaseId));
  if (existing) throw new Error('VERDICT_ALREADY_SUBMITTED');

  const [inspection] = await db
    .insert(siteInspections)
    .values({ phaseId, meetingId: siteVisit.id, r3AgentId, verdict, note })
    .returning();

  // Auto-close: per M6 spec, no DN decision is required once R3's verdict
  // lands - closure happens immediately as part of this same action.
  await db
    .update(phases)
    .set({ status: 'closed', closedAt: new Date() })
    .where(eq(phases.id, phaseId));

  await logAudit({
    userId: r3AgentId,
    action: 'INSPECTION_VERDICT_SUBMITTED',
    module: 'M6',
    entityId: inspection.id,
    details: { verdict },
  });

  await logAudit({
    userId: r3AgentId,
    action: 'PHASE_CLOSED',
    module: 'M6',
    entityId: phaseId,
    details: { trigger: 'auto_on_verdict' },
  });

  return toInspectionView(inspection);
}

// ── R3's own dossier queue ───────────────────────────────────────────────
export async function getMyQueue(r3AgentId: number): Promise<MyQueueItem[]> {
  const rows = await db
    .select({
      phaseId: phases.id,
      phaseStatus: phases.status,
      openedAt: phases.openedAt,
      closedAt: phases.closedAt,
      requestId: requests.id,
      requestReference: requests.reference,
      requestType: requests.requestType,
      organisationName: organisations.name,
      payment: payments,
      siteVisit: meetings,
      inspection: siteInspections,
    })
    .from(meetings)
    .innerJoin(phases, eq(meetings.phaseId, phases.id))
    .innerJoin(requests, eq(phases.requestId, requests.id))
    .innerJoin(organisations, eq(requests.organisationId, organisations.id))
    .leftJoin(payments, eq(payments.phaseId, phases.id))
    .leftJoin(siteInspections, eq(siteInspections.phaseId, phases.id))
    .where(
      and(
        eq(phases.phaseCode, 'M6'),
        eq(meetings.meetingType, 'site_visit'),
        eq(meetings.dnAgentId, r3AgentId)
      )
    )
    .orderBy(desc(meetings.scheduledAt));

  return rows.map((row) => {
    const state = missionState({
      phaseStatus: row.phaseStatus,
      payment: row.payment,
      siteVisit: row.siteVisit,
      inspection: row.inspection,
    });
    return {
      phaseId: row.phaseId,
      phaseStatus: row.phaseStatus,
      openedAt: row.openedAt,
      closedAt: row.closedAt,
      requestId: row.requestId,
      requestReference: row.requestReference,
      requestType: row.requestType,
      organisationName: row.organisationName,
      payment: row.payment ? toPaymentView(row.payment) : null,
      siteVisit: toSiteVisitView(row.siteVisit),
      inspection: row.inspection ? toInspectionView(row.inspection) : null,
      ...state,
    };
  });
}
