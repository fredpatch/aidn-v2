import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import {
  phases,
  requests,
  payments,
  formalRequestDocuments,
  documentEvaluations,
  documentVersions,
} from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { linkUploadAssetToOwner } from '../uploads/uploads.service.js';
import { SLOT_LABELS } from '../formal-request/formal-request.service.js';
import type {
  PaymentView,
  DocumentEvaluationView,
  DeepEvaluationBundle,
} from './deep-evaluation.types.js';

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

function toEvalView(
  evalRow: typeof documentEvaluations.$inferSelect | null,
  formalDoc: typeof formalRequestDocuments.$inferSelect
): DocumentEvaluationView {
  return {
    id: evalRow?.id ?? 0,
    formalRequestDocumentId: formalDoc.id,
    slot: formalDoc.slot,
    label: SLOT_LABELS[formalDoc.slot] ?? formalDoc.slot,
    currentFileUrl: evalRow?.resubmittedFileUrl ?? formalDoc.fileUrl,
    verdict: evalRow?.verdict ?? null,
    evaluatedAt: evalRow?.evaluatedAt ?? null,
    correctionDeadline: evalRow?.correctionDeadline ?? null,
    resubmittedFileUrl: evalRow?.resubmittedFileUrl ?? null,
    resubmittedAt: evalRow?.resubmittedAt ?? null,
  };
}

// ── Open M5 ───────────────────────────────────────────────────────────────
export async function openDeepEvaluationPhase(
  requestId: number,
  actorUserId: number
): Promise<{ id: number }> {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');

  const [m4] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M4')));
  if (!m4 || m4.status !== 'closed') throw new Error('M4_NOT_CLOSED');

  const [existing] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M5')));
  if (existing) throw new Error('PHASE_ALREADY_OPEN');

  const [phase] = await db.insert(phases).values({ requestId, phaseCode: 'M5' }).returning();

  await db.insert(payments).values({ phaseId: phase.id });

  const m4Docs = await db
    .select()
    .from(formalRequestDocuments)
    .where(eq(formalRequestDocuments.phaseId, m4.id));

  if (m4Docs.length > 0) {
    await db
      .insert(documentEvaluations)
      .values(m4Docs.map((doc) => ({ formalRequestDocumentId: doc.id })));
  }

  await logAudit({
    userId: actorUserId,
    action: 'PHASE_OPENED',
    module: 'M5',
    entityId: phase.id,
    details: { requestId, phaseCode: 'M5' },
  });

  return { id: phase.id };
}

// ── Bundle ─────────────────────────────────────────────────────────────────
export async function getBundleForRequest(requestId: number): Promise<DeepEvaluationBundle> {
  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M5')));

  if (!phase) {
    return {
      phase: null,
      payment: null,
      evaluations: [],
      completionRate: { total: 0, validated: 0, pending: 0, needsAction: 0 },
    };
  }

  const [payment] = await db.select().from(payments).where(eq(payments.phaseId, phase.id));

  const [m4] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M4')));

  let evaluations: DocumentEvaluationView[] = [];

  if (m4) {
    const m4Docs = await db
      .select()
      .from(formalRequestDocuments)
      .where(eq(formalRequestDocuments.phaseId, m4.id));

    if (m4Docs.length > 0) {
      const docIds = m4Docs.map((d) => d.id);

      const evalRows = await db
        .select()
        .from(documentEvaluations)
        .where(inArray(documentEvaluations.formalRequestDocumentId, docIds));

      const evalsByDocId = new Map(evalRows.map((ev) => [ev.formalRequestDocumentId, ev]));

      evaluations = m4Docs.map((doc) => toEvalView(evalsByDocId.get(doc.id) ?? null, doc));
    }
  }

  const validated = evaluations.filter((e) => e.verdict === 'validated').length;
  const needsAction = evaluations.filter(
    (e) => e.verdict === 'rejected' || e.verdict === 'needs_correction'
  ).length;
  const pending = evaluations.filter((e) => e.verdict === null).length;

  return {
    phase: {
      id: phase.id,
      status: phase.status,
      openedAt: phase.openedAt,
      closedAt: phase.closedAt,
    },
    payment: payment ? toPaymentView(payment) : null,
    evaluations,
    completionRate: { total: evaluations.length, validated, pending, needsAction },
  };
}

// ── Invoice ────────────────────────────────────────────────────────────────
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
    .set({
      invoiceFileUrl: fileUrl,
      invoiceUploadedAt: new Date(),
      status: 'awaiting_proof',
    })
    .where(eq(payments.id, payment.id))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'INVOICE_UPLOADED',
    module: 'M5',
    entityId: payment.id,
  });

  return toPaymentView(updated);
}

// ── Proof of payment ───────────────────────────────────────────────────────
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
    .set({
      proofFileUrl: fileUrl,
      proofUploadedAt: new Date(),
      status: 'pending_validation',
    })
    .where(eq(payments.id, payment.id))
    .returning();

  await logAudit({
    action: 'PAYMENT_PROOF_UPLOADED',
    module: 'M5',
    entityId: payment.id,
  });

  return toPaymentView(updated);
}

// ── Validate / reject proof ────────────────────────────────────────────────
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
    module: 'M5',
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
          rejectionReason: `Paiement rejeté — dossier annulé : ${rejectionReason}`,
          updatedAt: new Date(),
        })
        .where(eq(requests.id, phase.requestId));
    }
  }

  await logAudit({
    userId: actorUserId,
    action: 'PAYMENT_REJECTED',
    module: 'M5',
    entityId: payment.id,
    details: { rejectionAction },
  });

  return toPaymentView(updated);
}

// ── Document evaluation ────────────────────────────────────────────────────
export async function setVerdict(
  evaluationId: number,
  verdict: 'validated' | 'rejected' | 'needs_correction',
  actorUserId: number,
  correctionDays?: number
): Promise<DocumentEvaluationView> {
  const [evalRow] = await db
    .select()
    .from(documentEvaluations)
    .where(eq(documentEvaluations.id, evaluationId));
  if (!evalRow) throw new Error('EVALUATION_NOT_FOUND');

  const [formalDoc] = await db
    .select()
    .from(formalRequestDocuments)
    .where(eq(formalRequestDocuments.id, evalRow.formalRequestDocumentId));
  if (!formalDoc) throw new Error('EVALUATION_NOT_FOUND');

  let correctionDeadline: Date | null = null;
  if (verdict !== 'validated' && correctionDays) {
    correctionDeadline = new Date();
    correctionDeadline.setDate(correctionDeadline.getDate() + correctionDays);
  }

  const [updated] = await db
    .update(documentEvaluations)
    .set({
      verdict,
      evaluatedBy: actorUserId,
      evaluatedAt: new Date(),
      correctionDeadline,
    })
    .where(eq(documentEvaluations.id, evaluationId))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'DOCUMENT_VERDICT_SET',
    module: 'M5',
    entityId: evaluationId,
    details: { verdict, slot: formalDoc.slot },
  });

  return toEvalView(updated, formalDoc);
}

// ── Resubmit corrected document ────────────────────────────────────────────
export async function resubmitDocument(
  evaluationId: number,
  fileUrl: string,
  mimeType: string,
  actorUserId?: number,
  uploadAssetId?: number
): Promise<DocumentEvaluationView> {
  const [evalRow] = await db
    .select()
    .from(documentEvaluations)
    .where(eq(documentEvaluations.id, evaluationId));
  if (!evalRow) throw new Error('EVALUATION_NOT_FOUND');

  if (evalRow.verdict !== 'rejected' && evalRow.verdict !== 'needs_correction') {
    throw new Error('RESUBMISSION_NOT_ALLOWED');
  }

  const [formalDoc] = await db
    .select()
    .from(formalRequestDocuments)
    .where(eq(formalRequestDocuments.id, evalRow.formalRequestDocumentId));
  if (!formalDoc) throw new Error('EVALUATION_NOT_FOUND');

  await db.insert(documentVersions).values({
    ownerType: 'formal_request_document',
    ownerId: formalDoc.id,
    fileUrl,
    mimeType,
    uploadedBy: actorUserId,
    isCurrent: true,
  });

  await linkUploadAssetToOwner({
    uploadAssetId,
    ownerType: 'formal_request_document',
    ownerId: formalDoc.id,
    expectedFileUrl: fileUrl,
  });

  const [updated] = await db
    .update(documentEvaluations)
    .set({
      resubmittedFileUrl: fileUrl,
      resubmittedAt: new Date(),
      verdict: null,
      evaluatedAt: null,
      correctionDeadline: null,
    })
    .where(eq(documentEvaluations.id, evaluationId))
    .returning();

  await logAudit({
    action: 'DOCUMENT_RESUBMITTED',
    module: 'M5',
    entityId: evaluationId,
    details: { slot: formalDoc.slot },
  });

  return toEvalView(updated, formalDoc);
}

// ── Close M5 ──────────────────────────────────────────────────────────────
export async function closeDeepEvaluationPhase(
  phaseId: number,
  actorUserId: number,
  params: {
    closureDocumentUrl?: string;
    closureDocumentMimeType?: string;
    closureDocumentUploadAssetId?: number;
    closureNote?: string;
  }
): Promise<void> {
  const [phase] = await db.select().from(phases).where(eq(phases.id, phaseId));
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  if (phase.status !== 'open') throw new Error('PHASE_ALREADY_CLOSED');

  const [payment] = await db.select().from(payments).where(eq(payments.phaseId, phaseId));
  if (!payment || payment.status !== 'validated') throw new Error('PAYMENT_NOT_VALIDATED');

  const [m4] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, phase.requestId), eq(phases.phaseCode, 'M4')));

  if (m4) {
    const m4Docs = await db
      .select()
      .from(formalRequestDocuments)
      .where(eq(formalRequestDocuments.phaseId, m4.id));

    if (m4Docs.length > 0) {
      const docIds = m4Docs.map((d) => d.id);
      const evalRows = await db
        .select()
        .from(documentEvaluations)
        .where(inArray(documentEvaluations.formalRequestDocumentId, docIds));

      const allValidated = evalRows.every((e) => e.verdict === 'validated');
      if (!allValidated) throw new Error('DOCUMENTS_NOT_ALL_VALIDATED');
    }
  }

  if (params.closureDocumentUrl) {
    await db.insert(documentVersions).values({
      ownerType: 'phase_closure_document',
      ownerId: phaseId,
      fileUrl: params.closureDocumentUrl,
      mimeType: params.closureDocumentMimeType ?? 'application/octet-stream',
      uploadedBy: actorUserId,
      isCurrent: true,
    });

    await linkUploadAssetToOwner({
      uploadAssetId: params.closureDocumentUploadAssetId,
      ownerType: 'phase_closure_document',
      ownerId: phaseId,
      expectedFileUrl: params.closureDocumentUrl,
    });
  }

  await db
    .update(phases)
    .set({
      status: 'closed',
      closedAt: new Date(),
      closureDocumentUrl: params.closureDocumentUrl,
      closureNote: params.closureNote,
    })
    .where(eq(phases.id, phaseId));

  await logAudit({
    userId: actorUserId,
    action: 'PHASE_CLOSED',
    module: 'M5',
    entityId: phaseId,
  });
}
