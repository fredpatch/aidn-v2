import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { missingFormalDocumentCount } from '@aidn/shared';
import type { DbExecutor } from '../../shared/db/index.js';
import {
  dgCircuitDocuments,
  documentEvaluations,
  formalRequestDocuments,
  meetings,
  payments,
  phases,
  preliminaryEvaluationForms,
} from '../../shared/db/schema.js';

/** WORKFLOW-FOUNDATION-1A - business readiness of a phase: is its substantive
 *  work done, so its closure courrier may start? Each gate is the rule the
 *  phase's own close service enforced until now, moved here unchanged (same
 *  queries, same order, same error codes) so the closure workflow and the
 *  transitional direct close paths share one source. Readiness is computed,
 *  never stored. Callers hold the phase row lock. */

export interface ClosurePhase {
  id: number;
  requestId: number;
  phaseCode: string;
}

/** The phase's current meeting (the latest not rescheduled) is held, absent
 *  or cancelled - not still scheduled. */
export async function assertCurrentMeetingResolved(executor: DbExecutor, phaseId: number): Promise<void> {
  const [currentMeeting] = await executor
    .select()
    .from(meetings)
    .where(and(eq(meetings.phaseId, phaseId), ne(meetings.status, 'rescheduled')))
    .orderBy(desc(meetings.scheduledAt));
  if (!currentMeeting || currentMeeting.status === 'scheduled') throw new Error('MEETING_NOT_RESOLVED');
}

/** M3 (PRELIM-DG-CIRCUIT-1) - the applicant returned the pre-evaluation
 *  declaration AND it completed the DG circuit (signed scan returned). */
export async function assertPreliminaryDeclarationReturned(executor: DbExecutor, phase: ClosurePhase): Promise<void> {
  const [evaluation] = await executor
    .select()
    .from(preliminaryEvaluationForms)
    .where(eq(preliminaryEvaluationForms.phaseId, phase.id));
  if (!evaluation || !evaluation.submittedFileUrl) throw new Error('DECLARATION_NOT_SUBMITTED');

  const [circuit] = await executor
    .select()
    .from(dgCircuitDocuments)
    .where(and(eq(dgCircuitDocuments.entityType, 'pre_evaluation'), eq(dgCircuitDocuments.requestId, phase.requestId)));
  if (!circuit || circuit.status !== 'pending_review') throw new Error('PRELIMINARY_DG_RETURN_REQUIRED');
}

/** M3 - meeting resolved, then the declaration and its DG return. */
export async function assertPreliminaryReady(executor: DbExecutor, phase: ClosurePhase): Promise<void> {
  await assertCurrentMeetingResolved(executor, phase.id);
  await assertPreliminaryDeclarationReturned(executor, phase);
}

/** M4 - (1) formal letter circuit reached pending_review, (2) every formal
 *  document submitted, (3) formal meeting resolved. */
export async function assertFormalReady(executor: DbExecutor, phase: ClosurePhase): Promise<void> {
  const [circuit] = await executor
    .select()
    .from(dgCircuitDocuments)
    .where(and(eq(dgCircuitDocuments.requestId, phase.requestId), eq(dgCircuitDocuments.entityType, 'formal_request_letter')));
  if (!circuit || circuit.status !== 'pending_review') throw new Error('LETTER_NOT_TRANSMITTED');

  const docs = await executor.select().from(formalRequestDocuments).where(eq(formalRequestDocuments.phaseId, phase.id));
  if (missingFormalDocumentCount(docs) > 0) throw new Error('DOCUMENTS_INCOMPLETE');

  await assertCurrentMeetingResolved(executor, phase.id);
}

/** M5 - payment validated, and every evaluation of the M4 documents
 *  validated (no M4, or no M4 document: nothing to check). */
export async function assertDeepEvaluationReady(executor: DbExecutor, phase: ClosurePhase): Promise<void> {
  const [payment] = await executor.select().from(payments).where(eq(payments.phaseId, phase.id));
  if (!payment || payment.status !== 'validated') throw new Error('PAYMENT_NOT_VALIDATED');

  const [m4] = await executor
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, phase.requestId), eq(phases.phaseCode, 'M4')));
  if (!m4) return;
  const m4Docs = await executor.select().from(formalRequestDocuments).where(eq(formalRequestDocuments.phaseId, m4.id));
  if (m4Docs.length === 0) return;
  const evalRows = await executor
    .select()
    .from(documentEvaluations)
    .where(
      inArray(
        documentEvaluations.formalRequestDocumentId,
        m4Docs.map((d) => d.id)
      )
    );
  if (!evalRows.every((e) => e.verdict === 'validated')) throw new Error('DOCUMENTS_NOT_ALL_VALIDATED');
}

type ReadinessPolicy = (executor: DbExecutor, phase: ClosurePhase) => Promise<void>;

/** Not available through the closure courrier yet. M6: the current site
 *  inspection is obsolete and auto-closes on the verdict until Inspection
 *  V2 replaces it. M7: delivery closes on certificate collection until the
 *  Delivery integration gives it a readiness rule (and dossier completion). */
const deferred: ReadinessPolicy = async () => {
  throw new Error('PHASE_CLOSURE_NOT_SUPPORTED');
};

const READINESS_BY_PHASE: Record<string, ReadinessPolicy> = {
  M3: assertPreliminaryReady,
  M4: assertFormalReady,
  M5: assertDeepEvaluationReady,
  M6: deferred,
  M7: deferred,
};

/** The phase's readiness rule, by phase code; precise error codes kept. */
export async function assertPhaseReadyForClosure(executor: DbExecutor, phase: ClosurePhase): Promise<void> {
  const policy = Object.hasOwn(READINESS_BY_PHASE, phase.phaseCode) ? READINESS_BY_PHASE[phase.phaseCode] : deferred;
  await policy(executor, phase);
}
