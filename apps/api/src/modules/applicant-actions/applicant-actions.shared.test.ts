/** SESSION1-UX-1 - the shared applicant predicates: what the routes accept
 *  (can…) and what the applicant is expected to do now (expects…).
 *  expects ⇒ can over each key's state space. Pure, no database. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPLICANT_ACTION_KEYS,
  APPLICANT_ACTION_PRIORITY,
  URGENCY_WINDOW_HOURS,
  canApplicantResubmit,
  canApplicantSubmitDeclaration,
  canApplicantSubmitFormalDocument,
  canApplicantSubmitLetter,
  canApplicantUploadProof,
  expectsCertificateCollection,
  expectsDocumentCorrection,
  expectsFormalDocuments,
  expectsFormalLetter,
  expectsPaymentProof,
  expectsPreliminaryDeclaration,
  isFormalDocumentMissing,
  missingFormalDocumentCount,
} from '@aidn/shared';

const PHASE_STATUSES = ['open', 'closed'];
const PAYMENT_STATUSES = ['awaiting_invoice', 'awaiting_proof', 'pending_validation', 'validated', 'rejected'];
const VERDICTS = [null, 'validated', 'rejected', 'needs_correction'] as const;

describe('applicant action keys and priorities', () => {
  it('eight keys, each with a base priority; blocking keys below 80', () => {
    assert.deepEqual([...APPLICANT_ACTION_KEYS], [
      'meeting_confirmation', 'signed_meeting_report', 'preliminary_declaration', 'formal_letter',
      'formal_missing_documents', 'payment_proof', 'document_correction', 'certificate_collection',
    ]);
    assert.deepEqual(APPLICANT_ACTION_PRIORITY, {
      meeting_confirmation: 10, payment_proof: 20, document_correction: 30, formal_letter: 40,
      formal_missing_documents: 50, preliminary_declaration: 60, signed_meeting_report: 80, certificate_collection: 90,
    });
    assert.equal(URGENCY_WINDOW_HOURS, 72);
  });
});

describe('M3 declaration', () => {
  it('expected only while available, not submitted, M3 open; expects ⇒ can', () => {
    for (const available of [null, new Date()]) {
      for (const submitted of [null, '/api/files/1']) {
        for (const status of PHASE_STATUSES) {
          const form = { madeAvailableAt: available, submittedFileUrl: submitted };
          const expects = expectsPreliminaryDeclaration(form, { status });
          assert.equal(expects, available !== null && submitted === null && status === 'open');
          if (expects) assert.equal(canApplicantSubmitDeclaration(form), true);
        }
      }
    }
  });
});

describe('M4 letter and pieces', () => {
  it('letter: M4 open and no letter circuit yet', () => {
    assert.equal(expectsFormalLetter({ status: 'open' }, null), true);
    assert.equal(expectsFormalLetter({ status: 'open' }, { status: 'submitted' }), false);
    assert.equal(expectsFormalLetter({ status: 'closed' }, null), false);
    for (const status of PHASE_STATUSES) {
      for (const letter of [null, { status: 'submitted' }]) {
        if (expectsFormalLetter({ status }, letter)) assert.equal(canApplicantSubmitLetter({ status }, letter), true);
      }
    }
  });

  it('a piece is missing exactly when the closure gate says so (status missing), whatever fileUrl says', () => {
    assert.equal(isFormalDocumentMissing({ status: 'missing' }), true);
    assert.equal(isFormalDocumentMissing({ status: 'submitted' }), false);
  });

  it('pieces: M4 open and at least one missing row; count = missing rows; no letter gate (D4)', () => {
    const docs = [{ status: 'missing' }, { status: 'submitted' }, { status: 'missing' }];
    assert.equal(missingFormalDocumentCount(docs), 2);
    assert.equal(expectsFormalDocuments({ status: 'open' }, docs), true);
    assert.equal(expectsFormalDocuments({ status: 'open' }, [{ status: 'submitted' }]), false);
    assert.equal(expectsFormalDocuments({ status: 'closed' }, docs), false);
    // expects ⇒ at least one slot the route accepts
    assert.ok(docs.some((doc) => canApplicantSubmitFormalDocument({ status: 'open' }, doc)));
  });
});

describe('payment proof (D11)', () => {
  it('expected only for awaiting_proof with an invoice; pending_validation stays replaceable but not expected', () => {
    for (const status of PAYMENT_STATUSES) {
      for (const invoice of [null, '/api/files/9']) {
        const payment = { status, invoiceFileUrl: invoice };
        const expects = expectsPaymentProof(payment);
        assert.equal(expects, invoice !== null && status === 'awaiting_proof', `${status} ${invoice}`);
        if (expects) assert.equal(canApplicantUploadProof(payment), true);
      }
    }
    assert.equal(canApplicantUploadProof({ status: 'pending_validation', invoiceFileUrl: 'x' }), true);
    assert.equal(expectsPaymentProof({ status: 'pending_validation', invoiceFileUrl: 'x' }), false);
    assert.equal(expectsPaymentProof({ status: 'validated', invoiceFileUrl: 'x' }), false);
  });
});

describe('M5 corrections', () => {
  it('expected while M5 is open and a verdict asks for a correction; expects ⇒ can', () => {
    for (const verdict of VERDICTS) {
      for (const status of PHASE_STATUSES) {
        const expects = expectsDocumentCorrection({ status }, [{ verdict }]);
        assert.equal(expects, status === 'open' && (verdict === 'rejected' || verdict === 'needs_correction'));
        if (expects) assert.equal(canApplicantResubmit({ verdict }), true);
      }
    }
  });
});

describe('M7 certificate collection', () => {
  it('expected only when notified', () => {
    for (const status of ['in_preparation', 'printed', 'signed', 'archived', 'notified', 'collected']) {
      assert.equal(expectsCertificateCollection({ status }), status === 'notified');
    }
  });
});
