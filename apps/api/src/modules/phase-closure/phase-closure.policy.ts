import { and, eq, inArray } from 'drizzle-orm';
import { missingFormalDocumentCount, type PhaseClosureReadiness } from '@aidn/shared';
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
 *  work done, so its closure courrier may start? Each rule is the one the
 *  phase's former close service enforced, unchanged (same checks, same order,
 *  same error codes). Readiness is computed, never stored.
 *
 *  WORKFLOW-FOUNDATION-1B - the rules are pure functions of the phase's
 *  facts: the closure workflow loads one phase's facts (loadClosureFacts),
 *  the Demandes cockpit builds them from its batch rows (no query per
 *  dossier). One rule, two ways to gather its facts. */

export interface ClosurePhase {
  id: number;
  requestId: number;
  phaseCode: string;
}

/** What the readiness rules read. Each phase uses its own fields. */
export interface ClosureFacts {
  /** The phase's meetings (all of them; the current one is chosen here). */
  meetings: Array<{ status: string; scheduledAt: Date }>;
  /** M3 - the pre-evaluation declaration returned by the applicant. */
  declarationFileUrl: string | null;
  /** M3 - the declaration's DG circuit (pre_evaluation). */
  preEvaluationCircuitStatus: string | null;
  /** M4 - the formal letter's DG circuit (formal_request_letter). */
  letterCircuitStatus: string | null;
  /** M4 - the formal documents of the phase. */
  formalDocuments: Array<{ status: string }>;
  /** M5 - the phase payment. */
  paymentStatus: string | null;
  /** M5 - the verdicts of the evaluations of the M4 documents. */
  m4EvaluationVerdicts: Array<string | null>;
}

/** The current meeting: the latest (by date) that was not rescheduled. */
function currentMeeting(list: ClosureFacts['meetings']) {
  return list
    .filter((meeting) => meeting.status !== 'rescheduled')
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())[0];
}

/** The current meeting is held, absent or cancelled - not still scheduled. */
function meetingBlocker(facts: ClosureFacts): string | null {
  const meeting = currentMeeting(facts.meetings);
  return !meeting || meeting.status === 'scheduled' ? 'MEETING_NOT_RESOLVED' : null;
}

/** M3 - meeting resolved, declaration returned, and (PRELIM-DG-CIRCUIT-1)
 *  its DG circuit completed: applicant submission alone never suffices. */
function preliminaryBlocker(facts: ClosureFacts): string | null {
  const meeting = meetingBlocker(facts);
  if (meeting) return meeting;
  if (!facts.declarationFileUrl) return 'DECLARATION_NOT_SUBMITTED';
  if (facts.preEvaluationCircuitStatus !== 'pending_review') return 'PRELIMINARY_DG_RETURN_REQUIRED';
  return null;
}

/** M4 - letter circuit back (pending_review), no missing document, formal
 *  meeting resolved. */
function formalBlocker(facts: ClosureFacts): string | null {
  if (facts.letterCircuitStatus !== 'pending_review') return 'LETTER_NOT_TRANSMITTED';
  if (missingFormalDocumentCount(facts.formalDocuments) > 0) return 'DOCUMENTS_INCOMPLETE';
  return meetingBlocker(facts);
}

/** M5 - payment validated, every evaluation of the M4 documents validated
 *  (none: nothing to check). */
function deepEvaluationBlocker(facts: ClosureFacts): string | null {
  if (facts.paymentStatus !== 'validated') return 'PAYMENT_NOT_VALIDATED';
  if (!facts.m4EvaluationVerdicts.every((verdict) => verdict === 'validated')) return 'DOCUMENTS_NOT_ALL_VALIDATED';
  return null;
}

/** Not available through the closure courrier yet. M6: the current site
 *  inspection is obsolete and auto-closes on the verdict until Inspection
 *  V2 replaces it. M7: delivery closes on certificate collection until the
 *  Delivery integration gives it a readiness rule (and dossier completion). */
const deferred = (): string => 'PHASE_CLOSURE_NOT_SUPPORTED';

const BLOCKER_BY_PHASE: Record<string, (facts: ClosureFacts) => string | null> = {
  M3: preliminaryBlocker,
  M4: formalBlocker,
  M5: deepEvaluationBlocker,
  M6: deferred,
  M7: deferred,
};

/** The phase's readiness refusal code, or null when ready. Pure. */
export function closureBlocker(phaseCode: string, facts: ClosureFacts): string | null {
  return (Object.hasOwn(BLOCKER_BY_PHASE, phaseCode) ? BLOCKER_BY_PHASE[phaseCode] : deferred)(facts);
}

/** WORKFLOW-FOUNDATION-1B - the French wording of every readiness refusal,
 *  one place for the error responses and the read model's blocker. */
export const READINESS_BLOCKER_MESSAGES: Record<string, string> = {
  MEETING_NOT_RESOLVED:
    "La réunion doit d'abord être résolue (tenue, absence, ou dossier annulé) avant de clôturer la phase.",
  DECLARATION_NOT_SUBMITTED:
    "Le postulant doit d'abord retourner sa déclaration de pré-évaluation remplie avant de clôturer la phase.",
  PRELIMINARY_DG_RETURN_REQUIRED:
    "La déclaration de pré-évaluation doit d'abord revenir signée/visée par la DG (circuit courrier) avant de clôturer la phase.",
  LETTER_NOT_TRANSMITTED: "La lettre de demande formelle doit d'abord être transmise à la DN avant de clôturer.",
  DOCUMENTS_INCOMPLETE: 'Les 11 documents doivent tous être soumis avant de clôturer la phase.',
  PAYMENT_NOT_VALIDATED: 'Le paiement doit être validé avant de clôturer la phase.',
  DOCUMENTS_NOT_ALL_VALIDATED: 'Tous les documents doivent être validés avant de clôturer la phase.',
  PHASE_CLOSURE_NOT_SUPPORTED: "La clôture par courrier n'est pas encore disponible pour cette phase.",
};

export function readinessOf(phaseCode: string, facts: ClosureFacts): PhaseClosureReadiness {
  const code = closureBlocker(phaseCode, facts);
  return code === null
    ? { ready: true, blockerCode: null, blockerMessage: null }
    : { ready: false, blockerCode: code, blockerMessage: READINESS_BLOCKER_MESSAGES[code] };
}

const NO_FACTS: ClosureFacts = {
  meetings: [],
  declarationFileUrl: null,
  preEvaluationCircuitStatus: null,
  letterCircuitStatus: null,
  formalDocuments: [],
  paymentStatus: null,
  m4EvaluationVerdicts: [],
};

async function circuitStatus(executor: DbExecutor, requestId: number, entityType: 'pre_evaluation' | 'formal_request_letter') {
  const [circuit] = await executor
    .select({ status: dgCircuitDocuments.status })
    .from(dgCircuitDocuments)
    .where(and(eq(dgCircuitDocuments.entityType, entityType), eq(dgCircuitDocuments.requestId, requestId)));
  return circuit?.status ?? null;
}

const phaseMeetings = (executor: DbExecutor, phaseId: number) =>
  executor.select({ status: meetings.status, scheduledAt: meetings.scheduledAt }).from(meetings).where(eq(meetings.phaseId, phaseId));

/** One phase's facts, read on `executor` (inside the caller's transaction). */
export async function loadClosureFacts(executor: DbExecutor, phase: ClosurePhase): Promise<ClosureFacts> {
  if (phase.phaseCode === 'M3') {
    const [form] = await executor
      .select({ submittedFileUrl: preliminaryEvaluationForms.submittedFileUrl })
      .from(preliminaryEvaluationForms)
      .where(eq(preliminaryEvaluationForms.phaseId, phase.id));
    return {
      ...NO_FACTS,
      meetings: await phaseMeetings(executor, phase.id),
      declarationFileUrl: form?.submittedFileUrl ?? null,
      preEvaluationCircuitStatus: await circuitStatus(executor, phase.requestId, 'pre_evaluation'),
    };
  }
  if (phase.phaseCode === 'M4') {
    return {
      ...NO_FACTS,
      meetings: await phaseMeetings(executor, phase.id),
      letterCircuitStatus: await circuitStatus(executor, phase.requestId, 'formal_request_letter'),
      formalDocuments: await executor
        .select({ status: formalRequestDocuments.status })
        .from(formalRequestDocuments)
        .where(eq(formalRequestDocuments.phaseId, phase.id)),
    };
  }
  if (phase.phaseCode === 'M5') {
    const [payment] = await executor.select({ status: payments.status }).from(payments).where(eq(payments.phaseId, phase.id));
    const verdicts = await executor
      .select({ verdict: documentEvaluations.verdict })
      .from(documentEvaluations)
      .innerJoin(formalRequestDocuments, eq(formalRequestDocuments.id, documentEvaluations.formalRequestDocumentId))
      .innerJoin(phases, eq(phases.id, formalRequestDocuments.phaseId))
      .where(and(eq(phases.requestId, phase.requestId), inArray(phases.phaseCode, ['M4'])));
    return { ...NO_FACTS, paymentStatus: payment?.status ?? null, m4EvaluationVerdicts: verdicts.map((row) => row.verdict) };
  }
  return NO_FACTS;
}

/** The phase's readiness rule, by phase code; precise error codes kept. */
export async function assertPhaseReadyForClosure(executor: DbExecutor, phase: ClosurePhase): Promise<void> {
  const code = closureBlocker(phase.phaseCode, await loadClosureFacts(executor, phase));
  if (code) throw new Error(code);
}

/** The same rule as a read: ready, or the refusal with its wording. */
export async function phaseClosureReadiness(executor: DbExecutor, phase: ClosurePhase): Promise<PhaseClosureReadiness> {
  return readinessOf(phase.phaseCode, await loadClosureFacts(executor, phase));
}
