import {
  buildChecklist,
  canClosePreliminaryPhase,
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
  };

  assert(!isMeetingResolved(emptyBundle), 'Meeting should not be resolved when absent.');
  assert(!isDeclarationSubmitted(emptyBundle), 'Declaration should not be submitted when absent.');
  assert(!canClosePreliminaryPhase(emptyBundle), 'Phase cannot close with empty bundle.');

  const completeBundle: PreliminaryBundle = {
    phase: { id: 1, status: 'open', openedAt: '2026-01-01', closedAt: null },
    meeting: {
      id: 7,
      scheduledAt: '2026-01-01T10:00:00.000Z',
      location: null,
      status: 'held',
      crDocumentUrl: null,
      crUploadedAt: null,
    },
    evaluation: {
      id: 2,
      templateFileUrl: '/uploads/template.pdf',
      madeAvailableAt: '2026-01-02T10:00:00.000Z',
      returnDeadline: '2026-01-20T10:00:00.000Z',
      submittedFileUrl: '/uploads/submitted.pdf',
      submittedAt: '2026-01-08T10:00:00.000Z',
    },
  };

  const checklist = buildChecklist(completeBundle);
  assert(checklist.length === 6, 'Checklist should expose six items.');
  assert(
    canClosePreliminaryPhase(completeBundle),
    'Phase should be closable when all gates are met.'
  );
}
