/** SESSION1-UX-1 - pure policy: from the rows, every action expected from the
 *  applicant, already ordered. No I/O, no French wording (the portal owns it). */
import {
  APPLICANT_ACTION_PRIORITY,
  URGENCY_WINDOW_HOURS,
  canApplicantResubmit,
  expectsCertificateCollection,
  expectsDocumentCorrection,
  expectsFormalDocuments,
  expectsFormalLetter,
  expectsPaymentProof,
  expectsPreliminaryDeclaration,
  missingFormalDocumentCount,
  type ApplicantAction,
  type ApplicantActionKey,
  type ApplicantActionPhase,
} from '@aidn/shared';
import {
  canApplicantRespond,
  canApplicantSubmitSignedReport,
  requiresApplicantConfirmation,
} from '../meetings/meeting-confirmation.js';
import { isDossierClosed } from '../requests/dossier-open.js';
import type { ApplicantActionRows } from './applicant-actions.rows.js';

export const ACTION_ANCHORS = {
  meeting: (meetingId: number) => `rendez-vous-${meetingId}`,
  signedReport: (meetingId: number) => `compte-rendu-${meetingId}`,
  declaration: 'declaration',
  letter: 'lettre',
  pieces: 'pieces',
  payment: (phaseCode: string) => `paiement-${phaseCode}`,
  corrections: 'corrections',
  collection: 'retrait',
} as const;

type Phase = ApplicantActionRows['phases'][number];

function action(
  key: ApplicantActionKey,
  phase: Phase,
  subjectId: number,
  anchor: string,
  now: Date,
  extra: { dueAt?: Date | null; count?: number; variant?: 'after_rejection' } = {}
): ApplicantAction {
  const due = extra.dueAt ?? null;
  return {
    id: `${key}:${phase.requestId}:${subjectId}`,
    key,
    requestId: phase.requestId,
    requestReference: phase.requestReference,
    phaseCode: phase.phaseCode as ApplicantActionPhase,
    priority: APPLICANT_ACTION_PRIORITY[key],
    urgent: due !== null && due.getTime() <= now.getTime() + URGENCY_WINDOW_HOURS * 3_600_000,
    anchor,
    dueAt: due ? due.toISOString() : null,
    ...(extra.count !== undefined ? { count: extra.count } : {}),
    ...(extra.variant ? { variant: extra.variant } : {}),
  };
}

export function buildApplicantActions(rows: ApplicantActionRows, now: Date): ApplicantAction[] {
  // The cockpit loads closed dossiers too (includeClosedDossiers): they never carry an action.
  const openPhases = rows.phases.filter((p) => !isDossierClosed(p.requestStatus));
  const phaseById = new Map(openPhases.map((p) => [p.id, p]));
  const phaseOf = (requestId: number, code: string) =>
    openPhases.find((p) => p.requestId === requestId && p.phaseCode === code);
  const out: ApplicantAction[] = [];

  for (const meeting of rows.meetings) {
    const phase = phaseById.get(meeting.phaseId);
    if (!phase || !requiresApplicantConfirmation(meeting.meetingType)) continue;
    if (canApplicantRespond(meeting)) {
      out.push(action('meeting_confirmation', phase, meeting.id, ACTION_ANCHORS.meeting(meeting.id), now, { dueAt: meeting.scheduledAt }));
    }
    // Only open dossiers reach this point, hence dossierClosed = false.
    if (canApplicantSubmitSignedReport(meeting, false)) {
      out.push(action('signed_meeting_report', phase, meeting.id, ACTION_ANCHORS.signedReport(meeting.id), now));
    }
  }
  for (const form of rows.forms) {
    const phase = phaseById.get(form.phaseId);
    if (phase && expectsPreliminaryDeclaration(form, phase)) {
      out.push(action('preliminary_declaration', phase, form.id, ACTION_ANCHORS.declaration, now, { dueAt: form.returnDeadline }));
    }
  }
  for (const phase of openPhases.filter((p) => p.phaseCode === 'M4')) {
    const letter =
      rows.circuits.find((c) => c.requestId === phase.requestId && c.entityType === 'formal_request_letter') ?? null;
    if (expectsFormalLetter(phase, letter)) out.push(action('formal_letter', phase, phase.id, ACTION_ANCHORS.letter, now));
    const docs = rows.formalDocuments.filter((d) => d.phaseId === phase.id);
    if (expectsFormalDocuments(phase, docs)) {
      out.push(action('formal_missing_documents', phase, phase.id, ACTION_ANCHORS.pieces, now, { count: missingFormalDocumentCount(docs) }));
    }
  }
  for (const payment of rows.payments) {
    const phase = phaseById.get(payment.phaseId);
    if (phase && expectsPaymentProof(payment)) {
      out.push(
        action('payment_proof', phase, payment.id, ACTION_ANCHORS.payment(phase.phaseCode), now,
          payment.rejectionReason ? { variant: 'after_rejection' } : {})
      );
    }
  }
  for (const m5 of openPhases.filter((p) => p.phaseCode === 'M5')) {
    const evaluations = rows.evaluations.filter((e) => e.requestId === m5.requestId);
    if (!expectsDocumentCorrection(m5, evaluations)) continue;
    const toCorrect = evaluations.filter(canApplicantResubmit); // same rule as the resubmit route
    const deadlines = toCorrect.map((e) => e.correctionDeadline).filter((d): d is Date => d !== null);
    const earliest = deadlines.length ? new Date(Math.min(...deadlines.map((d) => d.getTime()))) : null;
    out.push(action('document_correction', m5, m5.id, ACTION_ANCHORS.corrections, now, { dueAt: earliest, count: toCorrect.length }));
  }
  for (const certificate of rows.certificates) {
    const m7 = phaseOf(certificate.requestId, 'M7');
    if (m7 && expectsCertificateCollection(certificate)) {
      out.push(action('certificate_collection', m7, certificate.id, ACTION_ANCHORS.collection, now));
    }
  }
  return orderApplicantActions(out);
}

const time = (iso: string | null) => (iso === null ? Number.POSITIVE_INFINITY : Date.parse(iso));

/** Urgent first (by dueAt, then base priority), then non-urgent (base priority,
 *  then dueAt, nulls last), then requestReference, then id. */
export function orderApplicantActions(actions: ApplicantAction[]): ApplicantAction[] {
  const cmp = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1); // Infinity-safe
  return [...actions].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    const primary = a.urgent
      ? cmp(time(a.dueAt), time(b.dueAt)) || a.priority - b.priority
      : a.priority - b.priority || cmp(time(a.dueAt), time(b.dueAt));
    return primary || a.requestReference.localeCompare(b.requestReference) || a.id.localeCompare(b.id);
  });
}
