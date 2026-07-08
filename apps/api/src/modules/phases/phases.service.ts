import { eq, and } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import { phases, requests } from "../../shared/db/schema.js";
import { logAudit } from "../auth/auth.service.js";

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
export async function openPreliminaryPhase(requestId: number, actorUserId: number): Promise<PhaseView> {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error("REQUEST_NOT_FOUND");

  const [existing] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, "M3")));
  if (existing) throw new Error("PHASE_ALREADY_OPEN");

  if (request.status !== "pending_review") throw new Error("REQUEST_NOT_READY_FOR_PHASE");

  const [phase] = await db.insert(phases).values({ requestId, phaseCode: "M3" }).returning();

  await db.update(requests).set({ status: "in_progress", updatedAt: new Date() }).where(eq(requests.id, requestId));

  await logAudit({
    userId: actorUserId,
    action: "PHASE_OPENED",
    module: "M3",
    entityId: phase.id,
    details: { requestId, phaseCode: "M3" },
  });

  return toPhaseView(phase);
}

export async function getPhase(phaseId: number): Promise<PhaseView> {
  const [phase] = await db.select().from(phases).where(eq(phases.id, phaseId));
  if (!phase) throw new Error("PHASE_NOT_FOUND");
  return toPhaseView(phase);
}

export async function getPhaseByRequestAndCode(
  requestId: number,
  phaseCode: "M3" | "M4" | "M5" | "M6" | "M7"
): Promise<PhaseView | null> {
  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, phaseCode)));
  return phase ? toPhaseView(phase) : null;
}

/** Pattern "Cloture de phase" - doc attached OR note, either suffices, never
 *  automatic. No completeness gate for M3 specifically (unlike M4/M5) - see
 *  project/modules-feasibility.md M3. */
export async function closePhase(
  phaseId: number,
  actorUserId: number,
  params: { closureDocumentUrl?: string; closureNote?: string }
): Promise<PhaseView> {
  const [phase] = await db.select().from(phases).where(eq(phases.id, phaseId));
  if (!phase) throw new Error("PHASE_NOT_FOUND");
  if (phase.status !== "open") throw new Error("PHASE_ALREADY_CLOSED");
  if (!params.closureDocumentUrl && !params.closureNote) throw new Error("CLOSURE_EVIDENCE_REQUIRED");

  const [updated] = await db
    .update(phases)
    .set({
      status: "closed",
      closedAt: new Date(),
      closureDocumentUrl: params.closureDocumentUrl,
      closureNote: params.closureNote,
    })
    .where(eq(phases.id, phaseId))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: "PHASE_CLOSED",
    module: phase.phaseCode,
    entityId: phaseId,
  });

  return toPhaseView(updated);
}
