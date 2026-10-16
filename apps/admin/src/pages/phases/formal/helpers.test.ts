import { describe, expect, it } from 'vitest';
import { closureBlockReason, formalNextAction } from './helpers';
import type { FormalPhaseBundle } from './types';
import { CONFIRMED_NEGOTIATION } from '../../../test/meetingFixtures';
import { APPLICANT_OWNER, ASSISTANT_DG_OWNER, DN_OWNER, RECEPTION_OWNER } from '../owners';

const phase = { id: 1, status: 'open', openedAt: '2026-01-01', closedAt: null };
const letter = (status: string) => ({
  id: 1,
  status,
  fileUrl: null,
  signedAt: null,
  dnAgentId: null,
  currentVersionUploadedAt: null,
  versionCount: 1,
  hasPreviousVersions: false,
});
const docs = (missing: number) =>
  Array.from({ length: 11 }, (_, i) => ({
    id: i,
    slot: `s${i}`,
    label: `Doc ${i}`,
    status: i < missing ? ('missing' as const) : ('submitted' as const),
    fileUrl: null,
    submittedAt: null,
    currentVersionUploadedAt: null,
    versionCount: 0,
    hasPreviousVersions: false,
  }));
const meeting = (status: string, confirmationStatus: 'awaiting_applicant' | 'awaiting_dn' | 'confirmed') => ({
  id: 3,
  scheduledAt: '2026-02-01T10:00:00.000Z',
  location: null,
  status,
  crDocumentUrl: null,
  crUploadedAt: null,
  signedCrDocumentUrl: null,
  signedCrUploadedAt: null,
  negotiation: { ...CONFIRMED_NEGOTIATION, confirmationStatus },
});
function bundle(over: Record<string, unknown>): FormalPhaseBundle {
  return {
    phase,
    letterCircuit: letter('pending_review'),
    documents: docs(0),
    completionRate: 11,
    meeting: null,
    ...over,
  } as unknown as FormalPhaseBundle;
}

describe('formalNextAction (SESSION1-UX-1 §7.6)', () => {
  it('missing pieces: Pièces attendues du postulant, applicant, waiting', () => {
    const a = formalNextAction(bundle({ documents: docs(3), completionRate: 8 }));
    expect(a.title).toBe('Pièces attendues du postulant');
    expect(a.owner).toEqual(APPLICANT_OWNER);
    expect(a.state).toBe('waiting');
  });

  it('letter circuit: submitted Réception, in_signature_circuit / signed Assistant DG waiting', () => {
    const submitted = formalNextAction(bundle({ letterCircuit: letter('submitted') }));
    expect(submitted.owner).toEqual(RECEPTION_OWNER);
    expect(submitted.state).toBe('action_required');
    for (const status of ['in_signature_circuit', 'signed']) {
      const a = formalNextAction(bundle({ letterCircuit: letter(status) }));
      expect(a.owner).toEqual(ASSISTANT_DG_OWNER);
      expect(a.state).toBe('waiting');
    }
  });

  it('meeting scheduled awaiting the applicant: waiting on the applicant', () => {
    const a = formalNextAction(bundle({ meeting: meeting('scheduled', 'awaiting_applicant') }));
    expect(a.title).toBe('Confirmation du rendez-vous attendue');
    expect(a.owner).toEqual(APPLICANT_OWNER);
    expect(a.state).toBe('waiting');
  });

  it('meeting scheduled awaiting the DN: Contre-proposition à traiter', () => {
    const a = formalNextAction(bundle({ meeting: meeting('scheduled', 'awaiting_dn') }));
    expect(a.title).toBe('Contre-proposition à traiter');
    expect(a.owner).toEqual(DN_OWNER);
    expect(a.state).toBe('action_required');
  });

  it('meeting confirmed: Réunion formelle à résoudre; held: Phase prête à clôturer', () => {
    expect(formalNextAction(bundle({ meeting: meeting('scheduled', 'confirmed') })).title).toBe(
      'Réunion formelle à résoudre'
    );
    expect(formalNextAction(bundle({ meeting: meeting('held', 'confirmed') })).title).toBe('Phase prête à clôturer');
  });

  describe('cockpit order for the open M4 phase (final review I2)', () => {
    it('letter pending_review + pieces missing + meeting awaiting_dn: DN counter-proposal first', () => {
      const a = formalNextAction(
        bundle({ documents: docs(3), completionRate: 8, meeting: meeting('scheduled', 'awaiting_dn') })
      );
      expect(a.title).toBe('Contre-proposition à traiter');
      expect(a.owner).toEqual(DN_OWNER);
      expect(a.state).toBe('action_required');
    });

    it('counter-proposal wins over a letter circuit and a missing letter', () => {
      for (const letterCircuit of [null, letter('submitted'), letter('in_signature_circuit')]) {
        const a = formalNextAction(bundle({ letterCircuit, meeting: meeting('scheduled', 'awaiting_dn') }));
        expect(a.title).toBe('Contre-proposition à traiter');
        expect(a.owner).toEqual(DN_OWNER);
      }
    });

    it('missing letter: applicant, before anything else', () => {
      const a = formalNextAction(bundle({ letterCircuit: null, documents: docs(3), completionRate: 8 }));
      expect(a.title).toBe('Lettre officielle attendue');
      expect(a.owner).toEqual(APPLICANT_OWNER);
    });

    it('meeting awaiting the applicant wins over the letter circuit', () => {
      const a = formalNextAction(
        bundle({ letterCircuit: letter('submitted'), meeting: meeting('scheduled', 'awaiting_applicant') })
      );
      expect(a.title).toBe('Confirmation du rendez-vous attendue');
      expect(a.owner).toEqual(APPLICANT_OWNER);
      expect(a.state).toBe('waiting');
    });

    it('pieces missing win over the letter circuit (applicant before circuits)', () => {
      for (const status of ['submitted', 'in_signature_circuit', 'signed']) {
        const a = formalNextAction(bundle({ letterCircuit: letter(status), documents: docs(2), completionRate: 9 }));
        expect(a.title).toBe('Pièces attendues du postulant');
        expect(a.owner).toEqual(APPLICANT_OWNER);
        expect(a.state).toBe('waiting');
      }
    });
  });

  it('no phase: Démarrer la phase is DN action_required', () => {
    const a = formalNextAction(null);
    expect(a.owner).toEqual(DN_OWNER);
    expect(a.state).toBe('action_required');
  });

  it('closure block reasons keep their accents', () => {
    expect(closureBlockReason(bundle({ letterCircuit: letter('weird') }))).toContain('finalisé');
  });
});
