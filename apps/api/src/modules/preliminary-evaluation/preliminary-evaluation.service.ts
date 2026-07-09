import { eq, and, ne, desc } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import {
  preliminaryEvaluationForms,
  phases,
  requests,
  documentTemplates,
  meetings,
  documentVersions,
} from '../../shared/db/schema.js';
import { getIntegerValue } from '../system-parameters/system-parameters.service.js';
import { logAudit } from '../auth/auth.service.js';

export interface PreliminaryEvaluationView {
  id: number;
  phaseId: number;
  templateFileUrl: string | null;
  madeAvailableAt: Date | null;
  returnDeadline: Date | null;
  submittedFileUrl: string | null;
  submittedAt: Date | null;
}

async function toView(
  row: typeof preliminaryEvaluationForms.$inferSelect
): Promise<PreliminaryEvaluationView> {
  let templateFileUrl: string | null = null;
  if (row.templateId) {
    const [template] = await db
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, row.templateId));
    templateFileUrl = template?.fileUrl ?? null;
  }
  return {
    id: row.id,
    phaseId: row.phaseId,
    templateFileUrl,
    madeAvailableAt: row.madeAvailableAt,
    returnDeadline: row.returnDeadline,
    submittedFileUrl: row.submittedFileUrl,
    submittedAt: row.submittedAt,
  };
}

export async function getForPhase(phaseId: number): Promise<PreliminaryEvaluationView | null> {
  const [row] = await db
    .select()
    .from(preliminaryEvaluationForms)
    .where(eq(preliminaryEvaluationForms.phaseId, phaseId));
  return row ? toView(row) : null;
}

/** M3 - DN makes the blank declaration available to the applicant, after
 *  the preliminary meeting. Uses whatever template is currently active for
 *  the 'preliminary_evaluation_declaration' key (see document-templates
 *  module) - must be configured first. */
export async function makeAvailable(
  phaseId: number,
  actorUserId: number,
  returnDays?: number
): Promise<PreliminaryEvaluationView> {
  const [phase] = await db.select().from(phases).where(eq(phases.id, phaseId));
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  if (phase.phaseCode !== 'M3') throw new Error('WRONG_PHASE');
  if (phase.status !== 'open') throw new Error('PHASE_NOT_OPEN');

  const [heldMeeting] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.phaseId, phaseId), eq(meetings.status, 'held')));
  if (!heldMeeting) throw new Error('MEETING_NOT_HELD_YET');

  const [template] = await db
    .select()
    .from(documentTemplates)
    .where(eq(documentTemplates.key, 'preliminary_evaluation_declaration'));
  if (!template || !template.active || !template.fileUrl) {
    throw new Error('TEMPLATE_NOT_CONFIGURED');
  }

  const days = returnDays ?? (await getIntegerValue('preliminary_evaluation_return_days', 15));
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + days);

  const [existing] = await db
    .select()
    .from(preliminaryEvaluationForms)
    .where(eq(preliminaryEvaluationForms.phaseId, phaseId));

  let row: typeof preliminaryEvaluationForms.$inferSelect;
  if (existing) {
    [row] = await db
      .update(preliminaryEvaluationForms)
      .set({ templateId: template.id, madeAvailableAt: new Date(), returnDeadline: deadline })
      .where(eq(preliminaryEvaluationForms.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(preliminaryEvaluationForms)
      .values({
        phaseId,
        templateId: template.id,
        madeAvailableAt: new Date(),
        returnDeadline: deadline,
      })
      .returning();
  }

  await logAudit({
    userId: actorUserId,
    action: 'PRELIMINARY_EVALUATION_MADE_AVAILABLE',
    module: 'M3',
    entityId: row.id,
    details: { returnDays: days },
  });

  return toView(row);
}

/** Ownership is enforced by the controller (phase -> request -> applicantId
 *  check) before this is called. */
export async function submit(
  phaseId: number,
  fileUrl: string,
  mimeType: string
): Promise<PreliminaryEvaluationView> {
  const [row] = await db
    .select()
    .from(preliminaryEvaluationForms)
    .where(eq(preliminaryEvaluationForms.phaseId, phaseId));
  if (!row) throw new Error('NOT_YET_AVAILABLE');
  if (!row.madeAvailableAt) throw new Error('NOT_YET_AVAILABLE');

  // M8 pattern - every upload goes through document_versions first, same
  // as dg_circuit_documents and document_templates. A resubmission trashes
  // the previous version rather than silently overwriting it.
  if (row.submittedFileUrl) {
    await db
      .update(documentVersions)
      .set({ isCurrent: false, trashedAt: new Date() })
      .where(
        and(
          eq(documentVersions.ownerType, 'preliminary_evaluation_form'),
          eq(documentVersions.ownerId, row.id)
        )
      );
  }

  await db.insert(documentVersions).values({
    ownerType: 'preliminary_evaluation_form',
    ownerId: row.id,
    fileUrl,
    mimeType,
    isCurrent: true,
  });

  const [updated] = await db
    .update(preliminaryEvaluationForms)
    .set({ submittedFileUrl: fileUrl, submittedAt: new Date() })
    .where(eq(preliminaryEvaluationForms.id, row.id))
    .returning();

  await logAudit({
    action: 'PRELIMINARY_EVALUATION_SUBMITTED',
    module: 'M3',
    entityId: row.id,
    details: { mimeType },
  });

  return toView(updated);
}

/** Helper for controllers doing the ownership check: phase -> request -> applicantId. */
export async function getRequestIdForPhase(
  phaseId: number
): Promise<{ requestId: number; applicantId: number } | null> {
  const [phase] = await db.select().from(phases).where(eq(phases.id, phaseId));
  if (!phase) return null;
  const [request] = await db.select().from(requests).where(eq(requests.id, phase.requestId));
  if (!request) return null;
  return { requestId: request.id, applicantId: request.applicantId };
}

export interface PreliminaryPhaseBundle {
  phase: { id: number; status: string; openedAt: Date; closedAt: Date | null } | null;
  meeting: {
    id: number;
    scheduledAt: Date;
    location: string | null;
    status: string;
    crDocumentUrl: string | null;
    crUploadedAt: Date | null;
  } | null;
  evaluation: PreliminaryEvaluationView | null;
}

/** Single-call bundle for the portal - avoids exposing the staff-only
 *  phases/meetings endpoints to applicants just to assemble one screen.
 *  Ownership (does this request belong to the calling applicant) is
 *  enforced by the controller before this runs. */
export async function getBundleForRequest(requestId: number): Promise<PreliminaryPhaseBundle> {
  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M3')));

  if (!phase) {
    return { phase: null, meeting: null, evaluation: null };
  }

  // "Current" meeting = most recent non-superseded row - covers scheduled
  // (upcoming), held (with or without a CR yet), and no_show alike, but
  // not "rescheduled" ones since those were replaced by a newer row.
  const [meetingRow] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.phaseId, phase.id), ne(meetings.status, 'rescheduled')))
    .orderBy(desc(meetings.scheduledAt));

  const evaluation = await getForPhase(phase.id);

  return {
    phase: {
      id: phase.id,
      status: phase.status,
      openedAt: phase.openedAt,
      closedAt: phase.closedAt,
    },
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
    evaluation,
  };
}
