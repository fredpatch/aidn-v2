import { eq, and, inArray, desc } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import {
  phases,
  requests,
  payments,
  organisations,
  formalRequestDocuments,
  documentEvaluations,
  documentVersions,
} from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import {
  claimUploadAsset,
  linkLockedAsset,
  trashCurrentVersions,
  versionValues,
  type PreparedAttachment,
} from '../uploads/upload-attachment.js';
import { relocateDossierAssetAfterCommit } from '../files/relocate-asset.js';
import type { RelocationTarget } from '../files/relocate-asset.js';
import { attachPaymentInvoice, attachPaymentProof } from '../payments/payment-documents.js';
import { SLOT_LABELS } from '../formal-request/formal-request.service.js';
import type {
  PaymentView,
  DocumentEvaluationView,
  DeepEvaluationBundle,
  PaymentQueueItem,
} from './deep-evaluation.types.js';
import { rejectPhasePayment, stillPendingPayment } from '../payments/payment-decisions.js';

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

function nextPaymentAction(status: string): PaymentQueueItem['nextAction'] {
  if (status === 'awaiting_invoice') return 'send_invoice';
  if (status === 'pending_validation') return 'validate_payment';
  if (status === 'awaiting_proof') return 'waiting_for_proof';
  if (status === 'validated') return 'done';
  return 'rejected';
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
    .where(eq(phases.phaseCode, 'M5'))
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

// ── Invoice ────────────────────────────────────────────────────────────────
export async function uploadInvoice(
  phaseId: number,
  attachment: PreparedAttachment,
  actorUserId: number
): Promise<PaymentView> {
  return toPaymentView(await attachPaymentInvoice(phaseId, 'M5', attachment, actorUserId));
}

// ── Proof of payment ───────────────────────────────────────────────────────
export async function uploadPaymentProof(
  phaseId: number,
  requestId: number,
  applicantId: number,
  attachment: PreparedAttachment
): Promise<PaymentView> {
  return toPaymentView(await attachPaymentProof(phaseId, requestId, applicantId, 'M5', attachment));
}

// ── Validate / reject proof ────────────────────────────────────────────────
export async function validatePayment(phaseId: number, actorUserId: number): Promise<PaymentView> {
  const [payment] = await db.select().from(payments).where(eq(payments.phaseId, phaseId));
  if (!payment) throw new Error('PAYMENT_NOT_FOUND');
  if (payment.status !== 'pending_validation') throw new Error('PAYMENT_NOT_PENDING');

  const [updated] = await db
    .update(payments)
    .set({ status: 'validated', validatedBy: actorUserId, validatedAt: new Date() })
    .where(stillPendingPayment(payment.id))
    .returning();
  // K4 - another decision (rejection, double click) won the race.
  if (!updated) throw new Error('PAYMENT_NOT_PENDING');

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
  // K4 - one transaction, row locked, phase checked to be M5.
  const updated = await rejectPhasePayment({ phaseId, phaseCode: 'M5', actorUserId, rejectionAction, rejectionReason });
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
/** Applicant only (route: requireApplicant). The evaluation must belong to
 *  this applicant's dossier (D6) - otherwise "not found". */
export async function resubmitDocument(
  evaluationId: number,
  applicantId: number,
  attachment: PreparedAttachment
): Promise<DocumentEvaluationView> {
  let target: RelocationTarget | undefined;
  const { updated, formalDoc } = await db.transaction(async (tx) => {
    // Target first: the evaluation row, then the upload asset.
    const [evalRow] = await tx
      .select()
      .from(documentEvaluations)
      .where(eq(documentEvaluations.id, evaluationId))
      .for('update');
    if (!evalRow) throw new Error('EVALUATION_NOT_FOUND');

    const [owner] = await tx
      .select({ formalDoc: formalRequestDocuments, applicantId: requests.applicantId })
      .from(formalRequestDocuments)
      .innerJoin(phases, eq(phases.id, formalRequestDocuments.phaseId))
      .innerJoin(requests, eq(requests.id, phases.requestId))
      .where(eq(formalRequestDocuments.id, evalRow.formalRequestDocumentId));
    if (!owner || owner.applicantId !== applicantId) throw new Error('EVALUATION_NOT_FOUND');

    target = { ownerType: 'formal_request_document', ownerId: owner.formalDoc.id };
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') {
      return { updated: evalRow, formalDoc: owner.formalDoc };
    }
    if (evalRow.verdict !== 'rejected' && evalRow.verdict !== 'needs_correction') {
      throw new Error('RESUBMISSION_NOT_ALLOWED');
    }

    // VERSION-CURRENT-DISCIPLINE - the corrected document supersedes the
    // original submission for this slot, never coexists as a second current row.
    await trashCurrentVersions(tx, 'formal_request_document', owner.formalDoc.id);
    await tx.insert(documentVersions).values(versionValues(attachment, 'formal_request_document', owner.formalDoc.id));
    await linkLockedAsset(tx, attachment.assetId, target);

    const [saved] = await tx
      .update(documentEvaluations)
      .set({
        resubmittedFileUrl: attachment.fileUrl,
        resubmittedAt: new Date(),
        verdict: null,
        evaluatedAt: null,
        correctionDeadline: null,
      })
      .where(eq(documentEvaluations.id, evaluationId))
      .returning();

    await logAudit(
      {
        action: 'DOCUMENT_RESUBMITTED',
        module: 'M5',
        entityId: evaluationId,
        details: { slot: owner.formalDoc.slot },
      },
      tx
    );
    return { updated: saved, formalDoc: owner.formalDoc };
  });

  // STORAGE-2A - synchronous, post-commit, best-effort: never affects the
  // response above (fresh link and 'attached_here' retry both relocate).
  if (target) await relocateDossierAssetAfterCommit(attachment.assetId, target);

  return toEvalView(updated, formalDoc);
}

// ── Close M5 ──────────────────────────────────────────────────────────────
export async function closeDeepEvaluationPhase(
  phaseId: number,
  actorUserId: number,
  params: {
    /** Optional closure document (STORAGE-0B: a checked upload). */
    attachment?: PreparedAttachment;
    closureNote?: string;
  }
): Promise<void> {
  const { attachment } = params;
  const target: RelocationTarget = { ownerType: 'phase_closure_document', ownerId: phaseId };
  await db.transaction(async (tx) => {
    const [phase] = await tx.select().from(phases).where(eq(phases.id, phaseId)).for('update');
    if (!phase) throw new Error('PHASE_NOT_FOUND');
    if (attachment && (await claimUploadAsset(tx, attachment, target)) === 'attached_here') return;
    if (phase.status !== 'open') throw new Error('PHASE_ALREADY_CLOSED');

    const [payment] = await tx.select().from(payments).where(eq(payments.phaseId, phaseId));
    if (!payment || payment.status !== 'validated') throw new Error('PAYMENT_NOT_VALIDATED');

    const [m4] = await tx
      .select()
      .from(phases)
      .where(and(eq(phases.requestId, phase.requestId), eq(phases.phaseCode, 'M4')));

    if (m4) {
      const m4Docs = await tx
        .select()
        .from(formalRequestDocuments)
        .where(eq(formalRequestDocuments.phaseId, m4.id));

      if (m4Docs.length > 0) {
        const docIds = m4Docs.map((d) => d.id);
        const evalRows = await tx
          .select()
          .from(documentEvaluations)
          .where(inArray(documentEvaluations.formalRequestDocumentId, docIds));

        const allValidated = evalRows.every((e) => e.verdict === 'validated');
        if (!allValidated) throw new Error('DOCUMENTS_NOT_ALL_VALIDATED');
      }
    }

    if (attachment) {
      await tx.insert(documentVersions).values(versionValues(attachment, 'phase_closure_document', phaseId));
      await linkLockedAsset(tx, attachment.assetId, target);
    }

    await tx
      .update(phases)
      .set({
        status: 'closed',
        closedAt: new Date(),
        closureDocumentUrl: attachment?.fileUrl,
        closureNote: params.closureNote,
      })
      .where(eq(phases.id, phaseId));

    await logAudit({ userId: actorUserId, action: 'PHASE_CLOSED', module: 'M5', entityId: phaseId }, tx);
  });

  if (attachment) await relocateDossierAssetAfterCommit(attachment.assetId, target);
}
