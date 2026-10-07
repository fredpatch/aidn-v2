import { it } from 'vitest';
import {
  buildChecklist,
  canClosePreliminaryPhase,
  isCircuitReturned,
  isDeclarationSubmitted,
  isMeetingResolved,
} from './helpers';
import type { PreliminaryBundle } from '../../../lib/api/preliminary.types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runPreliminaryHelpersTests(): void {
  const emptyBundle: PreliminaryBundle = {
    phase: null,
    meeting: null,
    evaluation: null,
    circuit: null,
  };

  assert(!isMeetingResolved(emptyBundle), 'Meeting should not be resolved when absent.');
  assert(!isDeclarationSubmitted(emptyBundle), 'Declaration should not be submitted when absent.');
  assert(!isCircuitReturned(emptyBundle), 'Circuit should not be returned when absent.');
  assert(!canClosePreliminaryPhase(emptyBundle), 'Phase cannot close with empty bundle.');

  const meeting = {
    id: 7,
    scheduledAt: '2026-01-01T10:00:00.000Z',
    location: null,
    status: 'held',
    crDocumentUrl: null,
    crUploadedAt: null,
  };
  const evaluation = {
    id: 2,
    templateFileUrl: '/uploads/template.pdf',
    madeAvailableAt: '2026-01-02T10:00:00.000Z',
    returnDeadline: '2026-01-20T10:00:00.000Z',
    submittedFileUrl: '/uploads/submitted.pdf',
    submittedAt: '2026-01-08T10:00:00.000Z',
  };

  // PRELIM-DG-CIRCUIT-1 - submission alone (circuit not yet returned by DG)
  // must NOT make the phase closable, even though meeting + declaration are
  // both satisfied - this is the exact bug this task fixes.
  const submittedNotReturnedBundle: PreliminaryBundle = {
    phase: { id: 1, status: 'open', openedAt: '2026-01-01', closedAt: null },
    meeting,
    evaluation,
    circuit: { status: 'in_signature_circuit', fileUrl: null, signatureSentAt: '2026-01-09T10:00:00.000Z', signedAt: null, pendingReviewAt: null },
  };
  assert(
    !canClosePreliminaryPhase(submittedNotReturnedBundle),
    'Phase must not be closable before the DG circuit returns the signed declaration.'
  );

  const completeBundle: PreliminaryBundle = {
    phase: { id: 1, status: 'open', openedAt: '2026-01-01', closedAt: null },
    meeting,
    evaluation,
    circuit: {
      status: 'pending_review',
      fileUrl: '/api/files/42',
      signatureSentAt: '2026-01-09T10:00:00.000Z',
      signedAt: '2026-01-10T10:00:00.000Z',
      pendingReviewAt: '2026-01-10T10:00:00.000Z',
    },
  };

  const checklist = buildChecklist(completeBundle);
  assert(checklist.length === 7, 'Checklist should expose seven items.');
  assert(
    canClosePreliminaryPhase(completeBundle),
    'Phase should be closable when all gates, including the DG circuit return, are met.'
  );
}

// Batch K1: this runner used to be declared but never called, so none of the
// assertions above ever ran. Vitest now executes it on every test run.
it('preliminary phase helpers (checklist, closing rule)', () => {
  runPreliminaryHelpersTests();
});
