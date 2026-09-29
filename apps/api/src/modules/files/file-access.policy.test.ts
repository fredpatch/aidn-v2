import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileAddress, parseFileAddress } from '@aidn/shared';
import { canAccessFile, type FileActor, type FileContext } from './file-access.policy.js';

const staff = (...roles: string[]): FileActor => ({ kind: 'staff', userId: 10, roles });
const applicant = (applicantId: number): FileActor => ({ kind: 'applicant', applicantId });
const dossier = (stage: string, ownerType = 'formal_request_document', applicantId = 7): FileContext => ({
  kind: 'dossier',
  ownerType,
  requestId: 1,
  applicantId,
  stage,
});

describe('stable file address', () => {
  it('builds and parses /api/files/:id', () => {
    assert.equal(fileAddress(183), '/api/files/183');
    assert.equal(parseFileAddress('/api/files/183'), 183);
  });

  it('rejects anything else', () => {
    for (const value of ['', '/uploads/2026/x.pdf', '/api/files/', '/api/files/0', '/api/files/-1', '/api/files/1.5', '/api/files/12abc', '/api/files/1/content', 'https://x/api/files/1']) {
      assert.equal(parseFileAddress(value), null, value);
    }
  });
});

describe('canAccessFile', () => {
  it('lets SU open everything, including unresolvable files', () => {
    for (const context of [dossier('M3'), { kind: 'report' } as FileContext, { kind: 'unresolvable' } as FileContext]) {
      assert.equal(canAccessFile(staff('SU'), context), true);
    }
  });

  it('limits unlinked uploads to their uploader', () => {
    const byStaff: FileContext = { kind: 'unlinked', uploadedByUserId: 10, uploadedByApplicantId: null };
    const byApplicant: FileContext = { kind: 'unlinked', uploadedByUserId: null, uploadedByApplicantId: 7 };
    assert.equal(canAccessFile(staff('dn_agent'), byStaff), true);
    assert.equal(canAccessFile({ kind: 'staff', userId: 11, roles: ['dn_agent'] }, byStaff), false);
    assert.equal(canAccessFile(applicant(7), byApplicant), true);
    assert.equal(canAccessFile(applicant(8), byApplicant), false);
    assert.equal(canAccessFile(applicant(10), byStaff), false, 'an applicant id never matches a staff id');
  });

  it('lets only the applicant who submitted the request open dossier files', () => {
    assert.equal(canAccessFile(applicant(7), dossier('M4')), true);
    assert.equal(canAccessFile(applicant(8), dossier('M4')), false);
  });

  it('keeps closure documents and certificates staff-only for applicants', () => {
    assert.equal(canAccessFile(applicant(7), dossier('M4', 'phase_closure_document')), false);
    assert.equal(canAccessFile(applicant(7), dossier('M7', 'certificate_document')), false);
  });

  it('gives each staff role exactly the stages it can read', () => {
    const matrix: Record<string, string[]> = {
      dg_circuit: ['reception', 'assistant_dg', 'dn_agent', 'dn_supervisor'],
      M3: ['dn_agent', 'dn_supervisor'],
      M4: ['dn_agent', 'dn_supervisor'],
      M5: ['dn_agent', 'dn_supervisor', 's5_agent'],
      M6: ['dn_agent', 'dn_supervisor', 's5_agent', 'r3_agent'],
      M7: ['dn_agent', 'dn_supervisor', 's5_agent'],
    };
    const roles = ['reception', 'assistant_dg', 'dn_agent', 'dn_supervisor', 's5_agent', 'r3_agent'];
    for (const [stage, allowed] of Object.entries(matrix)) {
      for (const role of roles) {
        assert.equal(canAccessFile(staff(role), dossier(stage)), allowed.includes(role), `${role} on ${stage}`);
      }
    }
  });

  it('opens current active templates to any authenticated user, history to DN only', () => {
    const current: FileContext = { kind: 'template', active: true, isCurrent: true };
    const past: FileContext = { kind: 'template', active: true, isCurrent: false };
    const inactive: FileContext = { kind: 'template', active: false, isCurrent: true };
    assert.equal(canAccessFile(applicant(99), current), true);
    assert.equal(canAccessFile(staff('reception'), current), true);
    for (const context of [past, inactive]) {
      assert.equal(canAccessFile(applicant(99), context), false);
      assert.equal(canAccessFile(staff('reception'), context), false);
      assert.equal(canAccessFile(staff('dn_agent'), context), true);
      assert.equal(canAccessFile(staff('dn_supervisor'), context), true);
    }
  });

  it('limits reports to dn_supervisor', () => {
    assert.equal(canAccessFile(staff('dn_supervisor'), { kind: 'report' }), true);
    assert.equal(canAccessFile(staff('dn_agent'), { kind: 'report' }), false);
    assert.equal(canAccessFile(applicant(7), { kind: 'report' }), false);
  });

  it('refuses unresolvable files to everyone but SU', () => {
    assert.equal(canAccessFile(staff('dn_supervisor'), { kind: 'unresolvable' }), false);
    assert.equal(canAccessFile(applicant(7), { kind: 'unresolvable' }), false);
  });

  it('refuses an unknown stage rather than guessing', () => {
    assert.equal(canAccessFile(staff('dn_agent'), dossier('M9')), false);
  });
});
