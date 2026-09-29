import { eq, and, ne, desc } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import {
  phases,
  requests,
  documentVersions,
  meetings,
  preliminaryEvaluationForms,
} from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import {
  claimUploadAsset,
  linkLockedAsset,
  versionValues,
  type PreparedAttachment,
} from '../uploads/upload-attachment.js';

export interface PhaseView {
  id: number;
  requestId: number;
  phaseCode: string;
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  closureDocumentUrl: string | null;
  closureNote: string | null;
}

function toPhaseView(row: typeof phases.$inferSelect): PhaseView {
  return {
    id: row.id,
    requestId: row.requestId,
    phaseCode: row.phaseCode,
    status: row.status,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    closureDocumentUrl: row.closureDocumentUrl,
    closureNote: row.closureNote,
  };
}

/** M3 - opens the Preliminary phase once M1's DG circuit reaches
 *  pending_review. This is the moment DN actually "starts working" a
 *  dossier - see project/modules-feasibility.md M1/M3. */
export async function openPreliminaryPhase(
  requestId: number,
  actorUserId: number
): Promise<PhaseView> {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');

  const [existing] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M3')));
  if (existing) throw new Error('PHASE_ALREADY_OPEN');

  if (request.status !== 'pending_review') throw new Error('REQUEST_NOT_READY_FOR_PHASE');

  const [phase] = await db.insert(phases).values({ requestId, phaseCode: 'M3' }).returning();

  await db
    .update(requests)
    .set({ status: 'in_progress', updatedAt: new Date() })
    .where(eq(requests.id, requestId));

  await logAudit({
    userId: actorUserId,
    action: 'PHASE_OPENED',
    module: 'M3',
    entityId: phase.id,
    details: { requestId, phaseCode: 'M3' },
  });

  return toPhaseView(phase);
}

export async function getPhase(phaseId: number): Promise<PhaseView> {
  const [phase] = await db.select().from(phases).where(eq(phases.id, phaseId));
  if (!phase) throw new Error('PHASE_NOT_FOUND');
  return toPhaseView(phase);
}

export async function getPhaseByRequestAndCode(
  requestId: number,
  phaseCode: 'M3' | 'M4' | 'M5' | 'M6' | 'M7'
): Promise<PhaseView | null> {
  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, phaseCode)));
  return phase ? toPhaseView(phase) : null;
}

const ALL_PHASE_CODES = ['M3', 'M4', 'M5', 'M6', 'M7'] as const;

export interface PhaseSummaryItem {
  phaseCode: (typeof ALL_PHASE_CODES)[number];
  status: 'not_started' | 'open' | 'closed';
  openedAt: Date | null;
  closedAt: Date | null;
}

/** Lightweight per-phase status summary for a request, used by the admin
 *  sidebar to distinguish "already closed" (clickable, read-only) from
 *  "not yet opened" (locked) - previously indistinguishable, see
 *  project/hardening-plan.md workstream A. Read-only, low-sensitivity
 *  (just phase code + status + dates), so any authenticated staff member
 *  can call this regardless of which internal role they hold - unlike the
 *  rest of this module, not gated to dn_agent/dn_supervisor/SU, since
 *  r3_agent and s5_agent staff also land on phase detail pages that render
 *  this sidebar (e.g. via "Mes Inspections"). */
export async function getPhasesSummary(requestId: number): Promise<PhaseSummaryItem[]> {
  const rows = await db.select().from(phases).where(eq(phases.requestId, requestId));
  const byCode = new Map(rows.map((r) => [r.phaseCode, r]));

  return ALL_PHASE_CODES.map((phaseCode) => {
    const row = byCode.get(phaseCode);
    if (!row) {
      return { phaseCode, status: 'not_started', openedAt: null, closedAt: null };
    }
    return {
      phaseCode,
      status: row.status === 'closed' ? 'closed' : 'open',
      openedAt: row.openedAt,
      closedAt: row.closedAt,
    };
  });
}

/** Pattern "Cloture de phase" - doc attached and/or note, both fully
 *  optional (relaxed on Fred's explicit call after live testing,
 *  2026-07-08 - DN should never be blocked from closing just for not
 *  typing something).
 *
 *  Two separate gates, added after further live testing the same day -
 *  neither is about the note/doc fields, both are about whether closing
 *  is reachable at all: (1) the phase's meeting must actually be resolved
 *  (held/no_show/file_cancelled), and (2) the postulant must have
 *  returned their filled-in declaration de pre-evaluation. */
export async function closePhase(
  phaseId: number,
  actorUserId: number,
  params: {
    /** Optional closure document (STORAGE-0B: a checked upload). */
    attachment?: PreparedAttachment;
    closureNote?: string;
  }
): Promise<PhaseView> {
  const { attachment } = params;
  const updated = await db.transaction(async (tx) => {
    const [phase] = await tx.select().from(phases).where(eq(phases.id, phaseId)).for('update');
    if (!phase) throw new Error('PHASE_NOT_FOUND');
    const target = { ownerType: 'phase_closure_document', ownerId: phaseId } as const;
    if (attachment && (await claimUploadAsset(tx, attachment, target)) === 'attached_here') return phase;
    if (phase.status !== 'open') throw new Error('PHASE_ALREADY_CLOSED');

    const [currentMeeting] = await tx
      .select()
      .from(meetings)
      .where(and(eq(meetings.phaseId, phaseId), ne(meetings.status, 'rescheduled')))
      .orderBy(desc(meetings.scheduledAt));

    if (!currentMeeting || currentMeeting.status === 'scheduled') {
      throw new Error('MEETING_NOT_RESOLVED');
    }

    const [evaluation] = await tx
      .select()
      .from(preliminaryEvaluationForms)
      .where(eq(preliminaryEvaluationForms.phaseId, phaseId));

    if (!evaluation || !evaluation.submittedFileUrl) {
      throw new Error('DECLARATION_NOT_SUBMITTED');
    }

    if (attachment) {
      await tx.insert(documentVersions).values(versionValues(attachment, 'phase_closure_document', phaseId));
      await linkLockedAsset(tx, attachment.assetId, target);
    }

    const [closed] = await tx
      .update(phases)
      .set({
        status: 'closed',
        closedAt: new Date(),
        closureDocumentUrl: attachment?.fileUrl,
        closureNote: params.closureNote,
      })
      .where(eq(phases.id, phaseId))
      .returning();

    await logAudit(
      { userId: actorUserId, action: 'PHASE_CLOSED', module: phase.phaseCode, entityId: phaseId },
      tx
    );
    return closed;
  });

  return toPhaseView(updated);
}
