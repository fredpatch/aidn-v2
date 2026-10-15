import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssetContext, type AssetForContext, type FileContextStore } from './file-context.js';
import { canAccessFile } from './file-access.policy.js';

const REQUEST = { id: 1, applicantId: 7 };
const phases: Record<number, { requestId: number; phaseCode: string }> = {
  30: { requestId: 1, phaseCode: 'M3' },
  40: { requestId: 1, phaseCode: 'M4' },
  50: { requestId: 1, phaseCode: 'M5' },
  60: { requestId: 1, phaseCode: 'M6' },
  61: { requestId: 999, phaseCode: 'M6' }, // request missing
};

const store: FileContextStore = {
  async findRequestApplicant(requestId) {
    return requestId === REQUEST.id ? REQUEST.applicantId : null;
  },
  async findDgCircuit(id) {
    if (id === 7) return { requestId: 1, entityType: 'dn_director_annotation' };
    return id === 5 ? { requestId: 1, entityType: 'intake_request' } : null;
  },
  async findPhase(id) {
    return phases[id] ?? null;
  },
  async findOwnerPhaseId(ownerType, id) {
    const table: Record<string, Record<number, number>> = {
      formal_request_document: { 11: 40 },
      preliminary_evaluation_form: { 12: 30 },
      payment_invoice: { 13: 50 },
      payment_proof: { 14: 60, 15: 61 },
      meeting_report: { 16: 40 },
      meeting_report_signed: { 17: 30 },
    };
    return table[ownerType]?.[id] ?? null;
  },
  async findCertificateRequest(id) {
    return id === 70 ? 1 : null;
  },
  async findTemplate(id) {
    return id === 80 ? { active: true, fileUrl: '/api/files/100' } : id === 81 ? { active: false, fileUrl: '/uploads/t/legacy.docx' } : null;
  },
  async reportExists(id) {
    return id === 90;
  },
};

function asset(overrides: Partial<AssetForContext>): AssetForContext {
  return {
    id: 100,
    storageKey: 't/current.docx',
    linkedOwnerType: null,
    linkedOwnerId: null,
    uploadedByUserId: null,
    uploadedByApplicantId: 7,
    ...overrides,
  };
}

describe('resolveAssetContext', () => {
  it('describes an unlinked upload by its uploader', async () => {
    assert.deepEqual(await resolveAssetContext(asset({}), store), {
      kind: 'unlinked',
      uploadedByUserId: null,
      uploadedByApplicantId: 7,
    });
  });

  it('resolves DG circuit documents to the dg_circuit stage', async () => {
    assert.deepEqual(await resolveAssetContext(asset({ linkedOwnerType: 'dg_circuit_document', linkedOwnerId: 5 }), store), {
      kind: 'dossier',
      ownerType: 'dg_circuit_document',
      requestId: 1,
      applicantId: 7,
      stage: 'dg_circuit',
    });
  });

  it('resolves a Directeur DN circuit document to the dn_annotation stage', async () => {
    assert.deepEqual(await resolveAssetContext(asset({ linkedOwnerType: 'dg_circuit_document', linkedOwnerId: 7 }), store), {
      kind: 'dossier',
      ownerType: 'dg_circuit_document',
      requestId: 1,
      applicantId: 7,
      stage: 'dn_annotation',
    });
  });

  it('resolves phase-owned documents to their phase code', async () => {
    const cases: Array<[string, number, string]> = [
      ['formal_request_document', 11, 'M4'],
      ['preliminary_evaluation_form', 12, 'M3'],
      ['payment_invoice', 13, 'M5'],
      ['payment_proof', 14, 'M6'],
      ['meeting_report', 16, 'M4'],
      ['meeting_report_signed', 17, 'M3'],
      ['phase_closure_document', 50, 'M5'],
    ];
    for (const [ownerType, ownerId, stage] of cases) {
      const context = await resolveAssetContext(asset({ linkedOwnerType: ownerType, linkedOwnerId: ownerId }), store);
      assert.deepEqual(context, { kind: 'dossier', ownerType, requestId: 1, applicantId: 7, stage }, ownerType);
    }
  });

  it('SESSION1-MEET-2 - both CR chains: owning applicant and the DN roles only', async () => {
    for (const [ownerType, ownerId] of [['meeting_report', 16], ['meeting_report_signed', 17]] as const) {
      const context = await resolveAssetContext(asset({ linkedOwnerType: ownerType, linkedOwnerId: ownerId }), store);
      assert.equal(canAccessFile({ kind: 'applicant', applicantId: 7 }, context), true, `${ownerType}: owner`);
      assert.equal(canAccessFile({ kind: 'applicant', applicantId: 8 }, context), false, `${ownerType}: other applicant`);
      for (const role of ['dn_agent', 'dn_supervisor', 'SU']) {
        assert.equal(canAccessFile({ kind: 'staff', userId: 1, roles: [role] }, context), true, `${ownerType}: ${role}`);
      }
      for (const role of ['r3_agent', 's5_agent', 'reception', 'assistant_dg', 'assistant_dn']) {
        assert.equal(canAccessFile({ kind: 'staff', userId: 1, roles: [role] }, context), false, `${ownerType}: ${role}`);
      }
    }
  });

  it('an owner type nobody mapped is unresolvable (fail-closed, SU only)', async () => {
    const context = await resolveAssetContext(asset({ linkedOwnerType: 'not_mapped_yet', linkedOwnerId: 17 }), store);
    assert.deepEqual(context, { kind: 'unresolvable' });
  });

  it('resolves certificates to M7', async () => {
    const context = await resolveAssetContext(asset({ linkedOwnerType: 'certificate_document', linkedOwnerId: 70 }), store);
    assert.equal(context.kind === 'dossier' && context.stage, 'M7');
  });

  it('marks templates current when the template points at this asset (stable or legacy address)', async () => {
    assert.deepEqual(await resolveAssetContext(asset({ linkedOwnerType: 'document_template', linkedOwnerId: 80 }), store), {
      kind: 'template',
      active: true,
      isCurrent: true,
    });
    assert.deepEqual(
      await resolveAssetContext(asset({ id: 101, linkedOwnerType: 'document_template', linkedOwnerId: 80 }), store),
      { kind: 'template', active: true, isCurrent: false }
    );
    assert.deepEqual(
      await resolveAssetContext(asset({ id: 102, storageKey: 't/legacy.docx', linkedOwnerType: 'document_template', linkedOwnerId: 81 }), store),
      { kind: 'template', active: false, isCurrent: true }
    );
  });

  it('resolves reports', async () => {
    assert.deepEqual(await resolveAssetContext(asset({ linkedOwnerType: 'report', linkedOwnerId: 90 }), store), { kind: 'report' });
  });

  it('is unresolvable when any link in the chain is missing', async () => {
    const broken: Array<[string, number]> = [
      ['dg_circuit_document', 6],
      ['formal_request_document', 99],
      ['payment_proof', 15],
      ['phase_closure_document', 999],
      ['certificate_document', 71],
      ['document_template', 82],
      ['report', 91],
      ['something_new', 1],
    ];
    for (const [ownerType, ownerId] of broken) {
      assert.deepEqual(
        await resolveAssetContext(asset({ linkedOwnerType: ownerType, linkedOwnerId: ownerId }), store),
        { kind: 'unresolvable' },
        `${ownerType}:${ownerId}`
      );
    }
  });
});
