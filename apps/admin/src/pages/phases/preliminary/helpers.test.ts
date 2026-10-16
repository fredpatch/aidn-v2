import { describe, expect, it } from 'vitest';
import {
  buildChecklist,
  canClosePreliminaryPhase,
  isCircuitReturned,
  isDeclarationSubmitted,
  isMeetingResolved,
  preliminaryClosureBlockReason,
  preliminaryWorkflowSummary,
} from './helpers';
import type { PreliminaryBundle } from '../../../lib/api/preliminary.types';
import { CONFIRMED_NEGOTIATION } from '../../../test/meetingFixtures';
import { APPLICANT_OWNER, ASSISTANT_DG_OWNER, DN_OWNER, RECEPTION_OWNER } from '../owners';

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
    negotiation: CONFIRMED_NEGOTIATION,
    id: 7,
    scheduledAt: '2026-01-01T10:00:00.000Z',
    location: null,
    status: 'held',
    crDocumentUrl: null,
    crUploadedAt: null,
    signedCrDocumentUrl: null,
    signedCrUploadedAt: null,
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

describe('preliminaryWorkflowSummary (SESSION1-UX-1 §7.6)', () => {
  const phase = { id: 1, status: 'open', openedAt: '2026-01-01', closedAt: null };
  const baseMeeting = {
    id: 7,
    scheduledAt: '2026-01-01T10:00:00.000Z',
    location: null,
    status: 'held',
    crDocumentUrl: null,
    crUploadedAt: null,
    signedCrDocumentUrl: null,
    signedCrUploadedAt: null,
    negotiation: CONFIRMED_NEGOTIATION,
  };
  const returned = {
    id: 2,
    templateFileUrl: '/t.pdf',
    madeAvailableAt: '2026-01-02T10:00:00.000Z',
    returnDeadline: null,
    submittedFileUrl: '/s.pdf',
    submittedAt: '2026-01-08T10:00:00.000Z',
  };
  const circuit = (status: string) => ({
    status,
    fileUrl: null,
    signatureSentAt: null,
    signedAt: null,
    pendingReviewAt: null,
  });
  const scheduled = (confirmationStatus: 'awaiting_applicant' | 'awaiting_dn' | 'confirmed'): PreliminaryBundle => ({
    phase,
    meeting: { ...baseMeeting, status: 'scheduled', negotiation: { ...CONFIRMED_NEGOTIATION, confirmationStatus } },
    evaluation: null,
    circuit: null,
  });

  it('scheduled, awaiting the applicant: Confirmation du rendez-vous attendue, owner applicant, waiting', () => {
    const s = preliminaryWorkflowSummary(scheduled('awaiting_applicant'), null);
    expect(s.title).toBe('Confirmation du rendez-vous attendue');
    expect(s.owner).toEqual(APPLICANT_OWNER);
    expect(s.state).toBe('waiting');
  });

  it('scheduled, counter-proposal (awaiting_dn): Contre-proposition à traiter, DN, action_required', () => {
    const s = preliminaryWorkflowSummary(scheduled('awaiting_dn'), null);
    expect(s.title).toBe('Contre-proposition à traiter');
    expect(s.owner).toEqual(DN_OWNER);
    expect(s.state).toBe('action_required');
  });

  it('scheduled and confirmed: Réunion préliminaire à résoudre, DN', () => {
    const s = preliminaryWorkflowSummary(scheduled('confirmed'), null);
    expect(s.title).toBe('Réunion préliminaire à résoudre');
    expect(s.owner).toEqual(DN_OWNER);
  });

  it('declaration awaited: applicant, waiting', () => {
    const s = preliminaryWorkflowSummary(
      { phase, meeting: baseMeeting, evaluation: { ...returned, submittedFileUrl: null, submittedAt: null }, circuit: null },
      null
    );
    expect(s.title).toBe('Déclaration attendue');
    expect(s.owner).toEqual(APPLICANT_OWNER);
    expect(s.state).toBe('waiting');
  });

  it('declaration not yet made available: the DN has to provide it', () => {
    const s = preliminaryWorkflowSummary({ phase, meeting: baseMeeting, evaluation: null, circuit: null }, null);
    expect(s.owner).toEqual(DN_OWNER);
    expect(s.state).toBe('action_required');
  });

  it('declaration returned, circuit submitted: Réception print; in_signature_circuit / signed: Assistant DG waiting', () => {
    const submitted = preliminaryWorkflowSummary(
      { phase, meeting: baseMeeting, evaluation: returned, circuit: circuit('submitted') },
      null
    );
    expect(submitted.title).toBe('Impression et mise en circuit DG de la déclaration');
    expect(submitted.owner).toEqual(RECEPTION_OWNER);
    expect(submitted.state).toBe('action_required');
    for (const status of ['in_signature_circuit', 'signed']) {
      const s = preliminaryWorkflowSummary(
        { phase, meeting: baseMeeting, evaluation: returned, circuit: circuit(status) },
        null
      );
      expect(s.title).toBe('Circuit DG en cours');
      expect(s.owner).toEqual(ASSISTANT_DG_OWNER);
      expect(s.state).toBe('waiting');
    }
  });

  it('ready to close: DN, action_required', () => {
    const s = preliminaryWorkflowSummary(
      { phase, meeting: baseMeeting, evaluation: returned, circuit: circuit('pending_review') },
      null
    );
    expect(s.title).toBe('Phase prête à clôturer');
    expect(s.owner).toEqual(DN_OWNER);
    expect(s.state).toBe('action_required');
  });

  it('blockReason when the declaration is back but the DG circuit is pending', () => {
    const reason = preliminaryClosureBlockReason({
      phase,
      meeting: baseMeeting,
      evaluation: returned,
      circuit: circuit('in_signature_circuit'),
    });
    expect(reason).toBe('La clôture sera disponible au retour du circuit DG de la déclaration.');
  });

  it('blockReason: meeting unresolved, declaration missing (unchanged)', () => {
    expect(preliminaryClosureBlockReason(scheduled('confirmed'))).toBe(
      'La clôture sera disponible une fois la réunion résolue.'
    );
    expect(preliminaryClosureBlockReason({ phase, meeting: baseMeeting, evaluation: null, circuit: null })).toBe(
      'La clôture sera disponible une fois la déclaration retournée par le postulant.'
    );
  });

  it('signed copy awaited: metric Compte-rendu « Signé attendu »', () => {
    const crMeeting = { ...baseMeeting, crDocumentUrl: '/cr.pdf', signedCrDocumentUrl: null };
    const s = preliminaryWorkflowSummary(
      { phase, meeting: crMeeting, evaluation: returned, circuit: circuit('pending_review') },
      null
    );
    expect(s.metrics.find((m) => m.label === 'Compte-rendu')?.value).toBe('Signé attendu');
    const signed = preliminaryWorkflowSummary(
      {
        phase,
        meeting: { ...crMeeting, signedCrDocumentUrl: '/signed.pdf' },
        evaluation: returned,
        circuit: circuit('pending_review'),
      },
      null
    );
    expect(signed.metrics.find((m) => m.label === 'Compte-rendu')?.value).toBe('Déposé');
  });
});
