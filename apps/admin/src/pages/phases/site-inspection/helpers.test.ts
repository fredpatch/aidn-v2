import { describe, expect, it } from 'vitest';
import { siteInspectionWorkflowSummary } from './helpers';
import type { SiteInspectionBundle } from './types';
import { APPLICANT_OWNER, DN_OWNER, FINANCE_OWNER, INSPECTION_OWNER } from '../owners';

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
const bundle = (over: Record<string, unknown>): SiteInspectionBundle =>
  ({
    phase: { id: 1, status: 'open', openedAt: '2026-01-01', closedAt: null },
    payment: payment({}),
    siteVisit: null,
    inspection: null,
    ...over,
  }) as unknown as SiteInspectionBundle;

describe('siteInspectionWorkflowSummary (SESSION1-UX-1 §7.6)', () => {
  it('no invoice: Facture à envoyer, Finance', () => {
    const s = siteInspectionWorkflowSummary(bundle({ payment: payment({ invoiceFileUrl: null }) }));
    expect(s.title).toBe('Facture à envoyer');
    expect(s.owner).toEqual(FINANCE_OWNER);
    expect(s.state).toBe('action_required');
  });

  it('awaiting_proof: Preuve de paiement attendue du postulant, applicant, waiting', () => {
    const s = siteInspectionWorkflowSummary(bundle({}));
    expect(s.title).toBe('Preuve de paiement attendue du postulant');
    expect(s.owner).toEqual(APPLICANT_OWNER);
    expect(s.state).toBe('waiting');
  });

  it('pending_validation: Paiement à valider, Finance', () => {
    const s = siteInspectionWorkflowSummary(
      bundle({ payment: payment({ status: 'pending_validation', proofFileUrl: '/p.pdf' }) })
    );
    expect(s.title).toBe('Paiement à valider');
    expect(s.owner).toEqual(FINANCE_OWNER);
  });

  it('paid: DN plans the visit, resolves it, then Cellule Inspection gives the verdict', () => {
    const paid = payment({ status: 'validated' });
    expect(siteInspectionWorkflowSummary(bundle({ payment: paid })).owner).toEqual(DN_OWNER);
    const scheduled = siteInspectionWorkflowSummary(bundle({ payment: paid, siteVisit: { status: 'scheduled' } }));
    expect(scheduled.title).toBe('Visite sur site à résoudre');
    const held = siteInspectionWorkflowSummary(bundle({ payment: paid, siteVisit: { status: 'held' } }));
    expect(held.owner).toEqual(INSPECTION_OWNER);
    expect(held.state).toBe('action_required');
  });
});
