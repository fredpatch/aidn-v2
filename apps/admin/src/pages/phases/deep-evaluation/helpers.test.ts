import { describe, expect, it } from 'vitest';
import { deepEvaluationWorkflowSummary } from './helpers';
import type { DeepEvaluationBundle } from './types';
import { APPLICANT_OWNER, DN_OWNER, FINANCE_OWNER } from '../owners';

const payment = (over: Record<string, unknown>) => ({
  id: 1,
  status: 'awaiting_proof',
  invoiceFileUrl: '/inv.pdf',
  invoiceUploadedAt: null,
  proofFileUrl: null,
  proofUploadedAt: null,
  validatedAt: null,
  rejectionReason: null,
  rejectionAction: null,
  ...over,
});
type Verdict = 'validated' | 'rejected' | 'needs_correction' | null;
/** Three M4 documents; the default has every one evaluated and validated, so
 *  the payment branches are reached (no DN verdict pending). */
const bundle = (pay: unknown, verdicts: Verdict[] = ['validated', 'validated', 'validated']): DeepEvaluationBundle =>
  ({
    phase: { id: 1, status: 'open', openedAt: '2026-01-01', closedAt: null },
    payment: pay,
    evaluations: verdicts.map((verdict, i) => ({ id: i, verdict })),
    completionRate: {
      total: verdicts.length,
      validated: verdicts.filter((v) => v === 'validated').length,
      pending: verdicts.filter((v) => v === null).length,
      needsAction: verdicts.filter((v) => v === 'rejected' || v === 'needs_correction').length,
    },
  }) as unknown as DeepEvaluationBundle;

describe('deepEvaluationWorkflowSummary (SESSION1-UX-1 §7.6)', () => {
  it('no invoice: Facture à envoyer, Finance', () => {
    const s = deepEvaluationWorkflowSummary(bundle(payment({ invoiceFileUrl: null })), null);
    expect(s.title).toBe('Facture à envoyer');
    expect(s.owner).toEqual(FINANCE_OWNER);
    expect(s.owner.roles).toEqual(['s5_agent', 'SU']);
    expect(s.state).toBe('action_required');
  });

  it('awaiting_proof: Quittance attendue du postulant, applicant, waiting', () => {
    const s = deepEvaluationWorkflowSummary(bundle(payment({})), null);
    expect(s.title).toBe('Quittance attendue du postulant');
    expect(s.owner).toEqual(APPLICANT_OWNER);
    expect(s.state).toBe('waiting');
  });

  it('awaiting_proof with an old rejection reason is still the applicant (D11)', () => {
    const s = deepEvaluationWorkflowSummary(bundle(payment({ rejectionReason: 'Illisible' })), null);
    expect(s.owner).toEqual(APPLICANT_OWNER);
  });

  it('pending_validation: Paiement à valider, Finance', () => {
    const s = deepEvaluationWorkflowSummary(
      bundle(payment({ status: 'pending_validation', proofFileUrl: '/p.pdf' })),
      null
    );
    expect(s.title).toBe('Paiement à valider');
    expect(s.owner).toEqual(FINANCE_OWNER);
    expect(s.state).toBe('action_required');
  });

  describe('cockpit order for the open M5 phase (final review I2)', () => {
    it('payment awaiting_proof + documents awaiting a verdict: DN evaluates first', () => {
      const s = deepEvaluationWorkflowSummary(bundle(payment({}), [null, null, 'validated']), null);
      expect(s.title).toBe('Évaluer 2 document(s)');
      expect(s.owner).toEqual(DN_OWNER);
      expect(s.state).toBe('action_required');
    });

    it('documents awaiting a verdict win over Finance (no invoice, pending_validation)', () => {
      for (const pay of [payment({ invoiceFileUrl: null }), payment({ status: 'pending_validation', proofFileUrl: '/p' })]) {
        const s = deepEvaluationWorkflowSummary(bundle(pay, [null, 'needs_correction', 'validated']), null);
        expect(s.title).toBe('Évaluer 1 document(s)');
        expect(s.owner).toEqual(DN_OWNER);
      }
    });

    it('payment validated + corrections expected: waiting on the applicant', () => {
      const s = deepEvaluationWorkflowSummary(
        bundle(payment({ status: 'validated' }), ['needs_correction', 'rejected', 'validated']),
        'Tous les documents doivent être validés (1/3 actuellement).'
      );
      expect(s.title).toBe('Corrections attendues du postulant');
      expect(s.description).toBe('2 document(s) à corriger par le postulant.');
      expect(s.owner).toEqual(APPLICANT_OWNER);
      expect(s.state).toBe('waiting');
    });

    it('corrections expected win over Finance pending_validation', () => {
      const s = deepEvaluationWorkflowSummary(
        bundle(payment({ status: 'pending_validation', proofFileUrl: '/p' }), ['needs_correction', 'validated', 'validated']),
        null
      );
      expect(s.title).toBe('Corrections attendues du postulant');
      expect(s.owner).toEqual(APPLICANT_OWNER);
    });

    it('payment validated, all verdicts in and validated: Phase prête à clôturer (DN)', () => {
      const s = deepEvaluationWorkflowSummary(bundle(payment({ status: 'validated' })), null);
      expect(s.title).toBe('Phase prête à clôturer');
      expect(s.owner).toEqual(DN_OWNER);
    });
  });
});
