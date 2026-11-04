import { eq, and } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import {
  phases,
  requests,
  dgCircuitDocuments,
  organisations,
  applicants,
} from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { isDossierClosed } from '../requests/dossier-open.js';
import { isPreliminaryOpenable } from '../dn-annotation/dn-annotation.stage.js';
import { effectiveRequestStatus, requestStatusLabel } from '../requests/request-labels.js';

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
 *  dossier - see project/modules-feasibility.md M1/M3.
 *  M3-OPEN-ATOMIC-1 - one transaction: the request row is locked first so
 *  concurrent openings serialize (the second one then sees the M3 and gets
 *  PHASE_ALREADY_OPEN); the M3 row, the request projection and the audit
 *  commit together or not at all. */
export async function openPreliminaryPhase(
  requestId: number,
  actorUserId: number
): Promise<PhaseView> {
  return db.transaction(async (tx) => {
    const [request] = await tx.select().from(requests).where(eq(requests.id, requestId)).for('update');
    if (!request) throw new Error('REQUEST_NOT_FOUND');

    const [existing] = await tx
      .select({ id: phases.id })
      .from(phases)
      .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M3')));
    if (existing) throw new Error('PHASE_ALREADY_OPEN');

    if (request.status !== 'pending_review') throw new Error('REQUEST_NOT_READY_FOR_PHASE');

    // SESSION1-M1-1 - final gate: the Directeur DN circuit is authoritative,
    // requests.status is its projection. If they disagree, M3 stays closed.
    const [dnCircuit] = await tx
      .select({ status: dgCircuitDocuments.status })
      .from(dgCircuitDocuments)
      .where(
        and(eq(dgCircuitDocuments.requestId, requestId), eq(dgCircuitDocuments.entityType, 'dn_director_annotation'))
      );
    if (!isPreliminaryOpenable(request.status, dnCircuit?.status ?? null)) {
      throw new Error('DN_ANNOTATION_REQUIRED');
    }

    // One logical action time for the phase and the request projection.
    const openedAt = new Date();
    let phase: typeof phases.$inferSelect;
    try {
      [phase] = await tx.insert(phases).values({ requestId, phaseCode: 'M3', openedAt }).returning();
    } catch (error) {
      // Backstop behind the lock: phases_request_phase_idx (request_id, phase_code).
      if (isUniqueViolation(error)) throw new Error('PHASE_ALREADY_OPEN');
      throw error;
    }

    await tx
      .update(requests)
      .set({ status: 'in_progress', updatedAt: openedAt })
      .where(eq(requests.id, requestId));

    await logAudit(
      {
        userId: actorUserId,
        action: 'PHASE_OPENED',
        module: 'M3',
        entityId: phase.id,
        details: { requestId, phaseCode: 'M3' },
      },
      tx
    );

    return toPhaseView(phase);
  });
}

function isUniqueViolation(error: unknown): boolean {
  const pgCode = (error as { code?: string })?.code;
  const causeCode = (error as { cause?: { code?: string } })?.cause?.code;
  return pgCode === '23505' || causeCode === '23505';
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

export interface DossierStateView {
  status: string;
  closed: boolean;
  /** When the dossier was closed (its last update: a closed dossier is
   *  read-only since K7, so nothing moves it afterwards). Null while open. */
  closedAt: Date | null;
  /** Set on a rejected dossier; a cancellation stores no reason. */
  rejectionReason: string | null;
  /** DOSSIER-CONTEXT-UX-1 - which dossier the page is about; null for a role
   *  that cannot open any phase page. */
  identity: DossierIdentityView | null;
}

/** Identification only (no dossier content), labelled like the Demandes
 *  reading pane. */
export interface DossierIdentityView {
  reference: string;
  organisationName: string;
  applicantName: string | null;
  statusLabel: string;
}

/** Roles that can land on a phase page (M3-M7 for DN, the Finance M5/M6/M7
 *  views, the CI M6 view). Others keep the bare state, as before. */
export const PHASE_PAGE_ROLES = ['dn_agent', 'dn_supervisor', 'SU', 's5_agent', 'r3_agent'];

/** K7b - lets every phase page tell whether the dossier is closed (then the
 *  page is read-only). Same audience as getPhasesSummary: any staff role that
 *  can open a phase page, while GET /requests/:id stays DN-only. */
export async function getDossierState(requestId: number, viewerRoles: string[] = []): Promise<DossierStateView> {
  const [row] = await db
    .select({
      status: requests.status,
      updatedAt: requests.updatedAt,
      rejectionReason: requests.rejectionReason,
      reference: requests.reference,
      organisationName: organisations.name,
      applicantName: applicants.fullName,
      deliveryPhaseStatus: phases.status,
    })
    .from(requests)
    .leftJoin(organisations, eq(organisations.id, requests.organisationId))
    .leftJoin(applicants, eq(applicants.id, requests.applicantId))
    .leftJoin(phases, and(eq(phases.requestId, requests.id), eq(phases.phaseCode, 'M7')))
    .where(eq(requests.id, requestId));
  if (!row) throw new Error('REQUEST_NOT_FOUND');
  const closed = isDossierClosed(row.status);
  const showIdentity = viewerRoles.some((role) => PHASE_PAGE_ROLES.includes(role));
  return {
    status: row.status,
    closed,
    closedAt: closed ? row.updatedAt : null,
    rejectionReason: row.status === 'rejected' ? row.rejectionReason : null,
    identity: showIdentity
      ? {
          reference: row.reference,
          organisationName: row.organisationName ?? '',
          applicantName: row.applicantName,
          statusLabel: requestStatusLabel(effectiveRequestStatus(row.status, row.deliveryPhaseStatus)),
        }
      : null,
  };
}

