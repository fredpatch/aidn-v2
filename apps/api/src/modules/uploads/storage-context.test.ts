import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDossierStorageKey,
  isRelocatableOwnerType,
  PHASE_FOLDERS,
  RELOCATABLE_OWNER_TYPES_LIST,
  resolveStorageContext,
  type StorageContextDeps,
} from './storage-context.js';
import { UPLOAD_OWNER_TYPES } from './uploads.types.js';

function deps(overrides: Partial<StorageContextDeps> = {}): StorageContextDeps {
  return {
    dgCircuitDocument: async () => undefined,
    formalRequestDocument: async () => undefined,
    preliminaryEvaluationForm: async () => undefined,
    payment: async () => undefined,
    meetingReport: async () => undefined,
    phaseClosure: async () => undefined,
    certificate: async () => undefined,
    ...overrides,
  };
}

describe('resolveStorageContext', () => {
  it('excludes document_template and report', async () => {
    assert.equal(await resolveStorageContext('document_template', 1, deps()), null);
    assert.equal(await resolveStorageContext('report', 1, deps()), null);
  });

  it('disambiguates M1 (intake_request) vs M4 (formal_request_letter) for dg_circuit_document', async () => {
    const m1 = await resolveStorageContext(
      'dg_circuit_document',
      1,
      deps({ dgCircuitDocument: async () => ({ entityType: 'intake_request', reference: 'DEM-2026-01-01-ORG-01' }) })
    );
    assert.deepEqual(m1, { requestReference: 'DEM-2026-01-01-ORG-01', phaseFolder: PHASE_FOLDERS.M1, categorySlug: 'circuit-dg' });

    const m4 = await resolveStorageContext(
      'dg_circuit_document',
      2,
      deps({ dgCircuitDocument: async () => ({ entityType: 'formal_request_letter', reference: 'DEM-2026-01-01-ORG-01' }) })
    );
    assert.deepEqual(m4, { requestReference: 'DEM-2026-01-01-ORG-01', phaseFolder: PHASE_FOLDERS.M4, categorySlug: 'circuit-dg' });
  });

  it('formal_request_document gets an extra slot directory level, always under M4', async () => {
    const ctx = await resolveStorageContext(
      'formal_request_document',
      3,
      deps({ formalRequestDocument: async () => ({ slot: 'quality_manual', reference: 'DEM-REF' }) })
    );
    assert.deepEqual(ctx, { requestReference: 'DEM-REF', phaseFolder: PHASE_FOLDERS.M4, categorySlug: 'formal-documents/quality_manual' });
  });

  it('preliminary_evaluation_form is always M3', async () => {
    const ctx = await resolveStorageContext(
      'preliminary_evaluation_form',
      4,
      deps({ preliminaryEvaluationForm: async () => ({ reference: 'DEM-REF' }) })
    );
    assert.deepEqual(ctx, { requestReference: 'DEM-REF', phaseFolder: PHASE_FOLDERS.M3, categorySlug: 'preliminary-evaluation' });
  });

  it('payment_invoice and payment_proof resolve through payments.phaseId, for M5/M6/M7', async () => {
    for (const phaseCode of ['M5', 'M6', 'M7'] as const) {
      const invoice = await resolveStorageContext(
        'payment_invoice',
        5,
        deps({ payment: async () => ({ reference: 'DEM-REF', phaseCode }) })
      );
      assert.deepEqual(invoice, { requestReference: 'DEM-REF', phaseFolder: PHASE_FOLDERS[phaseCode], categorySlug: 'payment-invoices' });

      const proof = await resolveStorageContext(
        'payment_proof',
        6,
        deps({ payment: async () => ({ reference: 'DEM-REF', phaseCode }) })
      );
      assert.deepEqual(proof, { requestReference: 'DEM-REF', phaseFolder: PHASE_FOLDERS[phaseCode], categorySlug: 'payment-proofs' });
    }
  });

  it('meeting_report resolves through meetings.phaseId', async () => {
    const ctx = await resolveStorageContext(
      'meeting_report',
      7,
      deps({ meetingReport: async () => ({ reference: 'DEM-REF', phaseCode: 'M6' }) })
    );
    assert.deepEqual(ctx, { requestReference: 'DEM-REF', phaseFolder: PHASE_FOLDERS.M6, categorySlug: 'meeting-reports' });
  });

  it('phase_closure_document resolves through phases.id directly', async () => {
    const ctx = await resolveStorageContext(
      'phase_closure_document',
      8,
      deps({ phaseClosure: async () => ({ reference: 'DEM-REF', phaseCode: 'M5' }) })
    );
    assert.deepEqual(ctx, { requestReference: 'DEM-REF', phaseFolder: PHASE_FOLDERS.M5, categorySlug: 'phase-closure' });
  });

  it('certificate_document resolves through certificates.requestId, always M7', async () => {
    const ctx = await resolveStorageContext(
      'certificate_document',
      9,
      deps({ certificate: async () => ({ reference: 'DEM-REF' }) })
    );
    assert.deepEqual(ctx, { requestReference: 'DEM-REF', phaseFolder: PHASE_FOLDERS.M7, categorySlug: 'certificates' });
  });

  it('returns null when the row cannot be found, for any relocatable owner type', async () => {
    assert.equal(await resolveStorageContext('certificate_document', 999, deps()), null);
    assert.equal(await resolveStorageContext('payment_proof', 999, deps()), null);
  });
});

describe('isRelocatableOwnerType', () => {
  it('excludes document_template and report, includes everything else', () => {
    assert.equal(isRelocatableOwnerType('document_template'), false);
    assert.equal(isRelocatableOwnerType('report'), false);
    for (const t of [
      'dg_circuit_document',
      'formal_request_document',
      'preliminary_evaluation_form',
      'payment_invoice',
      'payment_proof',
      'meeting_report',
      'phase_closure_document',
      'certificate_document',
    ]) {
      assert.equal(isRelocatableOwnerType(t), true, t);
    }
  });

  it('RELOCATABLE_OWNER_TYPES_LIST is the exact same set isRelocatableOwnerType accepts - it is the single source of truth other modules (e.g. getUploadDiagnostics) must key off instead of duplicating this list', () => {
    for (const t of UPLOAD_OWNER_TYPES) {
      assert.equal(
        RELOCATABLE_OWNER_TYPES_LIST.includes(t),
        isRelocatableOwnerType(t),
        `RELOCATABLE_OWNER_TYPES_LIST disagrees with isRelocatableOwnerType for ${t}`
      );
    }
  });

  it('excludes exactly document_template and report from RELOCATABLE_OWNER_TYPES_LIST - these must never count as "needs relocation" in health diagnostics', () => {
    assert.equal(RELOCATABLE_OWNER_TYPES_LIST.includes('document_template'), false);
    assert.equal(RELOCATABLE_OWNER_TYPES_LIST.includes('report'), false);
    assert.equal(RELOCATABLE_OWNER_TYPES_LIST.length, UPLOAD_OWNER_TYPES.length - 2);
  });
});

describe('computeDossierStorageKey', () => {
  it('builds dossiers/<reference>/<phase>/<category>/<filename>, reusing the staging filename unchanged', () => {
    const key = computeDossierStorageKey(
      { requestReference: 'DEM-2026-09-29-ORG-01', phaseFolder: PHASE_FOLDERS.M7, categorySlug: 'certificates' },
      'staging/2026/09/29/1c4f9e2a-1111-4444-8888-abcdef123456.pdf'
    );
    assert.equal(key, 'dossiers/DEM-2026-09-29-ORG-01/M7-delivrance/certificates/1c4f9e2a-1111-4444-8888-abcdef123456.pdf');
  });

  it('expands a multi-segment category slug (formal-documents/<slot>) into nested directories', () => {
    const key = computeDossierStorageKey(
      { requestReference: 'DEM-REF', phaseFolder: PHASE_FOLDERS.M4, categorySlug: 'formal-documents/quality_manual' },
      'staging/2026/09/29/uuid-1.pdf'
    );
    assert.equal(key, 'dossiers/DEM-REF/M4-demande-formelle/formal-documents/quality_manual/uuid-1.pdf');
  });

  it('never uses anything from the staging key besides its final filename segment', () => {
    const key = computeDossierStorageKey(
      { requestReference: 'DEM-REF', phaseFolder: PHASE_FOLDERS.M3, categorySlug: 'preliminary-evaluation' },
      'staging/2026/01/02/uuid-2.docx'
    );
    assert.ok(!key.includes('2026/01/02'));
    assert.ok(key.endsWith('/uuid-2.docx'));
  });
});
