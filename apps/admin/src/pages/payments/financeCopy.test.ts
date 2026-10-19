import { describe, expect, it } from 'vitest';
import { OPERATIONAL_OWNERS } from '@aidn/shared';
import { finance, financePayment } from '../../test/financeFixtures';
import type { FinanceQueueItem } from '../../lib/api/payments.types';
import { FINANCE_TAB_MODES, FINANCE_TABS, financeCallout, financeMetrics } from './financeCopy';

const item = finance;
const COUNTS = {
  invoice_to_send: 3,
  proof_to_validate: 2,
  awaiting_applicant: 4,
  done: 5,
  inactive: 9,
};

describe('financeCallout (D8 wording)', () => {
  it('titles and descriptions', () => {
    expect(financeCallout(item({ actionKey: 'send_invoice' })).title).toBe('Facture à transmettre');
    expect(financeCallout(item({ actionKey: 'validate_payment_proof' })).title).toBe(
      'Preuve de paiement à valider'
    );
    const waiting = financeCallout(
      item({ actionKey: 'await_payment_proof', bucket: 'awaiting_applicant' })
    );
    expect(waiting.title).toBe('En attente du postulant');
    expect(waiting.description).toBe(
      'La facture a été transmise. La preuve de paiement est attendue.'
    );
    const again = financeCallout(
      item({
        actionKey: 'await_payment_proof',
        newProofRequested: true,
        payment: financePayment({ rejectionReason: 'Montant illisible' }),
      })
    );
    expect(again.description).toBe(
      'La facture a été transmise. Nouvelle preuve de paiement demandée : Montant illisible'
    );
    expect(
      financeCallout(
        item({
          bucket: 'done',
          actionKey: 'none',
          payment: financePayment({ status: 'rejected' }),
          blockReason: 'dossier_closed',
        })
      ).title
    ).toBe('Dossier rejeté - paiement clos');
    expect(
      financeCallout(item({ bucket: 'inactive', actionKey: 'none', blockReason: 'dossier_closed' }))
        .title
    ).toBe('Dossier clos - consultation uniquement');
    expect(financeCallout(item({ bucket: 'done', actionKey: 'none' })).title).toBe(
      'Paiement validé'
    );
  });

  it('never says « quittance » nor « S5 »', () => {
    for (const key of [
      'send_invoice',
      'validate_payment_proof',
      'await_payment_proof',
      'none',
    ] as const) {
      const copy = financeCallout(item({ actionKey: key }));
      expect(`${copy.title} ${copy.description}`).not.toMatch(/quittance|S5/i);
    }
    for (const tab of FINANCE_TABS) expect(tab.label).not.toMatch(/quittance|S5/i);
  });
});

describe('financeMetrics', () => {
  const NOW = new Date('2026-10-16T12:00:00.000Z');
  const rows: FinanceQueueItem[] = [
    item({ id: 'M5:1', urgency: 'overdue' }),
    item({ id: 'M5:2' }),
    item({
      id: 'M6:3',
      bucket: 'proof_to_validate',
      actionKey: 'validate_payment_proof',
      urgency: 'overdue',
    }),
    item({
      id: 'M7:4',
      bucket: 'awaiting_applicant',
      state: 'waiting',
      owner: OPERATIONAL_OWNERS.applicant,
      actionKey: 'await_payment_proof',
      newProofRequested: true,
    }),
    item({
      id: 'M5:5',
      bucket: 'done',
      state: 'done',
      owner: null,
      actionKey: 'none',
      payment: financePayment({ status: 'validated', validatedAt: '2026-10-10T09:00:00.000Z' }),
    }),
    item({
      id: 'M5:6',
      bucket: 'done',
      state: 'done',
      owner: null,
      actionKey: 'none',
      payment: financePayment({ status: 'validated', validatedAt: '2026-08-01T09:00:00.000Z' }),
    }),
  ];

  it('action buckets only; « validés (30 j) » counts validatedAt within 30 days; inactive never shown', () => {
    const metrics = financeMetrics(rows, COUNTS, NOW);
    expect(metrics.map((m) => [m.key, m.value, m.detail ?? null])).toEqual([
      ['invoice_to_send', 3, 'dont 1 en retard'],
      ['proof_to_validate', 2, 'dont 1 en retard'],
      ['awaiting_applicant', 4, 'dont 1 nouvelle preuve demandée'],
      ['validated_30', 1, null],
    ]);
    expect(metrics.some((m) => m.value === 9)).toBe(false);
  });
});

describe('tabs', () => {
  it('modes: awaiting_applicant waits, done / all are history', () => {
    expect(FINANCE_TAB_MODES).toEqual({
      invoice_to_send: 'action',
      proof_to_validate: 'action',
      awaiting_applicant: 'waiting',
      done: 'history',
      all: 'history',
    });
    expect(FINANCE_TABS.map((t) => t.key)).toEqual([
      'invoice_to_send',
      'proof_to_validate',
      'awaiting_applicant',
      'done',
      'all',
    ]);
  });
});
