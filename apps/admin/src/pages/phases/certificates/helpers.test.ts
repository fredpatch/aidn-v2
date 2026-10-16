import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { certificateWorkflowSummary } from './helpers';
import type { CertificateBundle } from './types';
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
const certificate = (over: Record<string, unknown>) => ({
  id: 1,
  reference: 'C-1',
  status: 'in_preparation',
  approvalReferenceNumber: 'REF',
  scopeDetails: 'scope',
  printedAt: null,
  signedAt: null,
  signedFileUrl: null,
  archivedAt: null,
  notifiedAt: null,
  collectedAt: null,
  ...over,
});
const bundle = (over: Record<string, unknown>): CertificateBundle =>
  ({
    phase: { id: 1, status: 'open', openedAt: '2026-01-01', closedAt: null },
    payment: payment({ status: 'validated' }),
    certificate: null,
    ...over,
  }) as unknown as CertificateBundle;

describe('certificateWorkflowSummary (SESSION1-UX-1 §7.6)', () => {
  it('awaiting_proof: Quittance attendue du postulant, applicant, waiting', () => {
    const s = certificateWorkflowSummary(bundle({ payment: payment({}) }));
    expect(s.title).toBe('Quittance attendue du postulant');
    expect(s.owner).toEqual(APPLICANT_OWNER);
    expect(s.state).toBe('waiting');
  });

  it('pending_validation: Paiement à valider, Finance', () => {
    const s = certificateWorkflowSummary(
      bundle({ payment: payment({ status: 'pending_validation', proofFileUrl: '/p.pdf' }) })
    );
    expect(s.title).toBe('Paiement à valider');
    expect(s.owner).toEqual(FINANCE_OWNER);
  });

  it('no invoice: Facture à envoyer, Finance', () => {
    const s = certificateWorkflowSummary(bundle({ payment: payment({ invoiceFileUrl: null }) }));
    expect(s.title).toBe('Facture à envoyer');
    expect(s.owner).toEqual(FINANCE_OWNER);
  });

  it('lifecycle titles carry their accents and DN owns the steps', () => {
    const done = { status: 'generated', printedAt: 'x' };
    const signed = { ...done, signedAt: 'x', signedFileUrl: 'u' };
    const archived = { ...signed, archivedAt: 'x' };
    const notified = { ...archived, notifiedAt: 'x' };
    const title = (cert: Record<string, unknown> | null) =>
      certificateWorkflowSummary(bundle({ certificate: cert === null ? null : certificate(cert) })).title;
    expect([title(null), title({}), title(done), title(signed), title(archived), title(notified)]).toEqual([
      'Certificat à créer',
      'Document à générer',
      'Retour signé à enregistrer',
      'Archivage à effectuer',
      'Postulant à notifier',
      'Retrait à enregistrer',
    ]);
    expect(certificateWorkflowSummary(bundle({ certificate: certificate({}) })).owner).toEqual(DN_OWNER);
  });
});

describe('certificate collection ruling (final review I2)', () => {
  it('Retrait à enregistrer stays DN action_required on the phase page (the cockpit says the applicant is awaited)', () => {
    const notified = certificate({
      status: 'notified',
      printedAt: 'x',
      signedAt: 'x',
      signedFileUrl: 'u',
      archivedAt: 'x',
      notifiedAt: 'x',
    });
    const s = certificateWorkflowSummary(bundle({ certificate: notified }));
    expect(s.title).toBe('Retrait à enregistrer');
    expect(s.owner).toEqual(DN_OWNER);
    expect(s.state).toBe('action_required');
  });
});

describe('accents in phase helpers', () => {
  it('no text uses a bare infinitive after "a" instead of "à"', () => {
    for (const dir of ['preliminary', 'formal', 'deep-evaluation', 'site-inspection', 'certificates']) {
      const src = readFileSync(resolve(process.cwd(), 'src/pages/phases', dir, 'helpers.ts'), 'utf-8');
      expect(src).not.toMatch(/ a (résoudre|clôturer|créer|générer|enregistrer|effectuer|notifier)\b/);
    }
  });
});
