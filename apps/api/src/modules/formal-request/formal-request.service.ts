import { eq, and, ne, desc } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import {
  phases,
  requests,
  dgCircuitDocuments,
  formalRequestDocuments,
  documentVersions,
  meetings,
} from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import type {
  FormalDocumentView,
  FormalLetterCircuitView,
  FormalPhaseBundle,
} from './formal-request.types.js';

// ── Slot labels (French) ───────────────────────────────────────────────────
export const SLOT_LABELS: Record<string, string> = {
  form_dn_air_r2_3_f_e_010: "Formulaire DN-AIR-R2-3-F-E-010 — Demande d'agrément d'OMA",
  form_dn_air_r2_3_f_e_012_personnel:
    "Formulaires DN-AIR-R2-3-F-E-012 — Acceptation du personnel d'encadrement (+ CV + qualifications)",
  certification_personnel_list: 'Liste du personnel de certification',
  maintenance_procedures_manual: 'Manuel des Procédures de Maintenance (MPM)',
  quality_manual: 'Manuel Qualité (ou intégré au MPM)',
  sms_manual: 'Manuel SGS',
  capability_list: 'Liste des capacités (ou intégrée au MPM)',
  training_program: 'Manuel ou programme de formation (ou intégré au MPM)',
  subcontractor_contracts: "Copies des contrats avec les sous-traitants ou lettres d'intention",
  technical_documents: 'Documents techniques relatifs à la capacité de la structure',
  compliance_statement_011: 'État de conformité — Formulaire DN-AIR-R2-3-F-E-011',
};

export const ALL_SLOTS = Object.keys(SLOT_LABELS);

// ── Helpers ────────────────────────────────────────────────────────────────
function toCircuitView(row: typeof dgCircuitDocuments.$inferSelect): FormalLetterCircuitView {
  return {
    id: row.id,
    status: row.status,
    signedAt: row.signedAt,
    pendingReviewAt: row.pendingReviewAt,
  };
}

// ── Open M4 ───────────────────────────────────────────────────────────────
/** Gated on M3 being closed - a dossier can't enter formal phase until the
 *  preliminary phase is fully resolved. */
export async function openFormalPhase(
  requestId: number,
  actorUserId: number
): Promise<{ id: number }> {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');

  const [m3] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M3')));
  if (!m3 || m3.status !== 'closed') throw new Error('M3_NOT_CLOSED');

  const [existing] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M4')));
  if (existing) throw new Error('PHASE_ALREADY_OPEN');

  const [phase] = await db.insert(phases).values({ requestId, phaseCode: 'M4' }).returning();

  // Pre-create all 11 document slots as 'missing' so the checklist is
  // immediately visible even before the postulant uploads anything.
  await db.insert(formalRequestDocuments).values(
    ALL_SLOTS.map((slot) => ({
      phaseId: phase.id,
      slot: slot as (typeof formalRequestDocuments.$inferInsert)['slot'],
    }))
  );

  await logAudit({
    userId: actorUserId,
    action: 'PHASE_OPENED',
    module: 'M4',
    entityId: phase.id,
    details: { requestId, phaseCode: 'M4' },
  });

  return { id: phase.id };
}

// ── Formal letter Circuit DG ───────────────────────────────────────────────
/** Postulant submits the official formal request letter — goes through the
 *  same DG parapheur circuit as M1 (same table, same statuses, different
 *  entityType). */
export async function submitFormalLetter(
  requestId: number,
  fileUrl: string,
  mimeType: string,
  submittedByApplicantId?: number
): Promise<FormalLetterCircuitView> {
  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M4')));
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  if (phase.status !== 'open') throw new Error('PHASE_NOT_OPEN');

  const [existing] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(
      and(
        eq(dgCircuitDocuments.requestId, requestId),
        eq(dgCircuitDocuments.entityType, 'formal_request_letter')
      )
    );
  if (existing) throw new Error('LETTER_ALREADY_SUBMITTED');

  const [circuit] = await db
    .insert(dgCircuitDocuments)
    .values({
      requestId,
      entityType: 'formal_request_letter',
      status: 'submitted',
    })
    .returning();

  await db.insert(documentVersions).values({
    ownerType: 'formal_request_document',
    ownerId: circuit.id,
    fileUrl,
    mimeType,
    uploadedBy: submittedByApplicantId,
    isCurrent: true,
  });

  if (submittedByApplicantId) {
    await logAudit({
      action: 'FORMAL_LETTER_SUBMITTED',
      module: 'M4',
      entityId: circuit.id,
      details: { requestId },
    });
  }

  return toCircuitView(circuit);
}

export async function markLetterSigned(
  requestId: number,
  actorUserId: number
): Promise<FormalLetterCircuitView> {
  const [circuit] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(
      and(
        eq(dgCircuitDocuments.requestId, requestId),
        eq(dgCircuitDocuments.entityType, 'formal_request_letter')
      )
    );
  if (!circuit) throw new Error('LETTER_NOT_FOUND');
  if (circuit.status !== 'submitted') throw new Error('INVALID_CIRCUIT_TRANSITION');

  const [updated] = await db
    .update(dgCircuitDocuments)
    .set({ status: 'signed', signedAt: new Date() })
    .where(eq(dgCircuitDocuments.id, circuit.id))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'FORMAL_LETTER_SIGNED',
    module: 'M4',
    entityId: circuit.id,
  });

  return toCircuitView(updated);
}

export async function markLetterPendingReview(
  requestId: number,
  actorUserId: number
): Promise<FormalLetterCircuitView> {
  const [circuit] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(
      and(
        eq(dgCircuitDocuments.requestId, requestId),
        eq(dgCircuitDocuments.entityType, 'formal_request_letter')
      )
    );
  if (!circuit) throw new Error('LETTER_NOT_FOUND');
  if (circuit.status !== 'signed') throw new Error('INVALID_CIRCUIT_TRANSITION');

  const [updated] = await db
    .update(dgCircuitDocuments)
    .set({ status: 'pending_review' })
    .where(eq(dgCircuitDocuments.id, circuit.id))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'FORMAL_LETTER_TRANSMITTED',
    module: 'M4',
    entityId: circuit.id,
  });

  return toCircuitView(updated);
}

// ── Document slots ─────────────────────────────────────────────────────────
/** Either postulant (portal) or DN on their behalf (admin, physical drop-off).
 *  Uploading the same slot again replaces the previous version via M8 pattern. */
export async function submitDocument(
  requestId: number,
  slot: string,
  fileUrl: string,
  mimeType: string,
  actorUserId?: number
): Promise<FormalDocumentView> {
  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M4')));
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  if (phase.status !== 'open') throw new Error('PHASE_NOT_OPEN');

  const [doc] = await db
    .select()
    .from(formalRequestDocuments)
    .where(
      and(
        eq(formalRequestDocuments.phaseId, phase.id),
        eq(
          formalRequestDocuments.slot,
          slot as (typeof formalRequestDocuments.$inferInsert)['slot']
        )
      )
    );
  if (!doc) throw new Error('SLOT_NOT_FOUND');

  // M8 - trash the previous version if replacing
  if (doc.fileUrl) {
    await db
      .update(documentVersions)
      .set({ isCurrent: false, trashedAt: new Date() })
      .where(
        and(
          eq(documentVersions.ownerType, 'formal_request_document'),
          eq(documentVersions.ownerId, doc.id)
        )
      );
  }

  await db.insert(documentVersions).values({
    ownerType: 'formal_request_document',
    ownerId: doc.id,
    fileUrl,
    mimeType,
    uploadedBy: actorUserId,
    isCurrent: true,
  });

  const [updated] = await db
    .update(formalRequestDocuments)
    .set({ status: 'submitted', fileUrl, submittedAt: new Date() })
    .where(eq(formalRequestDocuments.id, doc.id))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'FORMAL_DOCUMENT_SUBMITTED',
    module: 'M4',
    entityId: doc.id,
    details: { slot },
  });

  return {
    id: updated.id,
    slot: updated.slot,
    label: SLOT_LABELS[updated.slot] ?? updated.slot,
    status: updated.status,
    fileUrl: updated.fileUrl,
    submittedAt: updated.submittedAt,
  };
}

// ── Bundle ─────────────────────────────────────────────────────────────────
export async function getBundleForRequest(requestId: number): Promise<FormalPhaseBundle> {
  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M4')));

  if (!phase) {
    return { phase: null, letterCircuit: null, documents: [], meeting: null, completionRate: 0 };
  }

  const [circuit] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(
      and(
        eq(dgCircuitDocuments.requestId, requestId),
        eq(dgCircuitDocuments.entityType, 'formal_request_letter')
      )
    );

  const docs = await db
    .select()
    .from(formalRequestDocuments)
    .where(eq(formalRequestDocuments.phaseId, phase.id));

  // Build the full slot list — always all 11, even if not yet uploaded
  const documents: FormalDocumentView[] = ALL_SLOTS.map((slot) => {
    const found = docs.find((d) => d.slot === slot);
    return {
      id: found?.id ?? null,
      slot,
      label: SLOT_LABELS[slot] ?? slot,
      status: found?.status ?? 'missing',
      fileUrl: found?.fileUrl ?? null,
      submittedAt: found?.submittedAt ?? null,
    };
  });

  const completionRate = documents.filter((d) => d.status === 'submitted').length;

  const [meetingRow] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.phaseId, phase.id), ne(meetings.status, 'rescheduled')))
    .orderBy(desc(meetings.scheduledAt));

  return {
    phase: {
      id: phase.id,
      status: phase.status,
      openedAt: phase.openedAt,
      closedAt: phase.closedAt,
    },
    letterCircuit: circuit ? toCircuitView(circuit) : null,
    documents,
    meeting: meetingRow
      ? {
          id: meetingRow.id,
          scheduledAt: meetingRow.scheduledAt,
          location: meetingRow.location,
          status: meetingRow.status,
          crDocumentUrl: meetingRow.crDocumentUrl,
          crUploadedAt: meetingRow.crUploadedAt,
        }
      : null,
    completionRate,
  };
}

// ── Close M4 ──────────────────────────────────────────────────────────────
/** Gated on: (1) formal letter circuit reached pending_review, (2) all 11
 *  documents submitted, (3) formal meeting resolved. */
export async function closeFormalPhase(
  phaseId: number,
  actorUserId: number,
  params: { closureDocumentUrl?: string; closureDocumentMimeType?: string; closureNote?: string }
): Promise<void> {
  const [phase] = await db.select().from(phases).where(eq(phases.id, phaseId));
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  if (phase.status !== 'open') throw new Error('PHASE_ALREADY_CLOSED');

  // Gate 1 — formal letter must have gone through DG
  const [circuit] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(
      and(
        eq(dgCircuitDocuments.requestId, phase.requestId),
        eq(dgCircuitDocuments.entityType, 'formal_request_letter')
      )
    );
  if (!circuit || circuit.status !== 'pending_review') throw new Error('LETTER_NOT_TRANSMITTED');

  // Gate 2 — all 11 documents
  const docs = await db
    .select()
    .from(formalRequestDocuments)
    .where(eq(formalRequestDocuments.phaseId, phaseId));
  const missing = docs.filter((d) => d.status === 'missing').length;
  if (missing > 0) throw new Error('DOCUMENTS_INCOMPLETE');

  // Gate 3 — formal meeting resolved
  const [currentMeeting] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.phaseId, phaseId), ne(meetings.status, 'rescheduled')))
    .orderBy(desc(meetings.scheduledAt));
  if (!currentMeeting || currentMeeting.status === 'scheduled')
    throw new Error('MEETING_NOT_RESOLVED');

  if (params.closureDocumentUrl) {
    await db.insert(documentVersions).values({
      ownerType: 'phase_closure_document',
      ownerId: phaseId,
      fileUrl: params.closureDocumentUrl,
      mimeType: params.closureDocumentMimeType ?? 'application/octet-stream',
      uploadedBy: actorUserId,
      isCurrent: true,
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

  await logAudit({ userId: actorUserId, action: 'PHASE_CLOSED', module: 'M4', entityId: phaseId });
}
