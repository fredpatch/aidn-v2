import { eq, and } from 'drizzle-orm';
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

  await logAudit({ userId: actorUserId, action: 'INVOICE_UPLOADED', module: 'M6', entityId: payment.id });

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

  await logAudit({ userId: actorUserId, action: 'PAYMENT_VALIDATED', module: 'M6', entityId: payment.id });

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
          rejectionReason: `Paiement rejeté — dossier annulé : ${rejectionReason}`,
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

// ── Site visit scheduling — wraps the shared meetings module ────────────
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

// ── R3 verdict — single submission, auto-closes the phase ───────────────
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
  // lands — closure happens immediately as part of this same action.
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
      requestId: requests.id,
      requestReference: requests.reference,
      organisationName: organisations.name,
    })
    .from(phases)
    .innerJoin(requests, eq(phases.requestId, requests.id))
    .innerJoin(organisations, eq(requests.organisationId, organisations.id))
    .where(and(eq(phases.phaseCode, 'M6'), eq(phases.status, 'open')));

  const items: MyQueueItem[] = [];
  for (const row of rows) {
    const [siteVisit] = await db
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.phaseId, row.phaseId),
          eq(meetings.meetingType, 'site_visit'),
          eq(meetings.dnAgentId, r3AgentId)
        )
      );
    if (!siteVisit) continue; // not this R3's dossier
    items.push({
      phaseId: row.phaseId,
      requestId: row.requestId,
      requestReference: row.requestReference,
      organisationName: row.organisationName,
      siteVisit: toSiteVisitView(siteVisit),
    });
  }
  return items;
}
