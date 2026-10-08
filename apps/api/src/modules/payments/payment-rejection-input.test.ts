/** K8 - S5 rejection body: action from the enum, trimmed non-empty reason,
 *  length limit; every refusal is a 400 for the three payment modules. No
 *  database needed. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PAYMENT_REJECTION_ACTIONS, PAYMENT_REJECTION_REASON_MAX_LENGTH } from '@aidn/shared';
import { paymentRejectionActionEnum } from '../../shared/db/schema.js';
import {
  handleCertificatesError,
  handleDeepEvaluationError,
  handleSiteInspectionError,
} from '../../shared/utils/error.js';
import { parsePaymentRejection } from './payment-rejection-input.js';

const refused = (body: unknown, code: string) =>
  assert.throws(() => parsePaymentRejection(body), { message: code }, JSON.stringify(body));

describe('parsePaymentRejection (K8)', () => {
  it('accepts both actions and trims the reason', () => {
    assert.deepEqual(parsePaymentRejection({ rejectionAction: 'request_new_proof', rejectionReason: '  Illisible \n' }), {
      rejectionAction: 'request_new_proof',
      rejectionReason: 'Illisible',
    });
    assert.equal(parsePaymentRejection({ rejectionAction: 'reject_dossier', rejectionReason: 'x' }).rejectionAction, 'reject_dossier');
  });

  it('unknown or missing action: REJECTION_ACTION_INVALID (was a PostgreSQL enum error, 500)', () => {
    for (const rejectionAction of [undefined, null, '', 'cancel', 'REJECT_DOSSIER', 1, ['reject_dossier'], {}]) {
      refused({ rejectionAction, rejectionReason: 'Motif' }, 'REJECTION_ACTION_INVALID');
    }
    refused(undefined, 'REJECTION_ACTION_INVALID');
    refused('reject_dossier', 'REJECTION_ACTION_INVALID');
  });

  it('missing, blank or non-text reason: REJECTION_REASON_REQUIRED (spaces used to be stored)', () => {
    for (const rejectionReason of [undefined, null, '', '   ', '\n\t ', 42, ['x'], { text: 'x' }]) {
      refused({ rejectionAction: 'reject_dossier', rejectionReason }, 'REJECTION_REASON_REQUIRED');
    }
  });

  it('length limit applies after trimming', () => {
    const max = 'a'.repeat(PAYMENT_REJECTION_REASON_MAX_LENGTH);
    assert.equal(parsePaymentRejection({ rejectionAction: 'request_new_proof', rejectionReason: `  ${max}  ` }).rejectionReason, max);
    refused({ rejectionAction: 'request_new_proof', rejectionReason: `${max}a` }, 'REJECTION_REASON_TOO_LONG');
  });

  it('the shared action list is exactly the database enum', () => {
    assert.deepEqual([...PAYMENT_REJECTION_ACTIONS], paymentRejectionActionEnum.enumValues);
  });
});

describe('rejection body errors are 400 in M5, M6 and M7 (K8)', () => {
  function respond(handler: typeof handleDeepEvaluationError, code: string) {
    const sent: { status?: number; body?: { message: string; code: string } } = {};
    const res = {
      status(value: number) {
        sent.status = value;
        return this;
      },
      json(body: { message: string; code: string }) {
        sent.body = body;
        return this;
      },
    };
    handler(res as never, new Error(code));
    return sent;
  }

  for (const [name, handler] of [
    ['M5', handleDeepEvaluationError],
    ['M6', handleSiteInspectionError],
    ['M7', handleCertificatesError],
  ] as const) {
    it(name, () => {
      assert.deepEqual(respond(handler, 'REJECTION_REASON_REQUIRED'), {
        status: 400,
        body: { message: 'Un motif de rejet est requis.', code: 'REJECTION_REASON_REQUIRED' },
      });
      const action = respond(handler, 'REJECTION_ACTION_INVALID');
      assert.equal(action.status, 400);
      assert.equal(action.body?.code, 'REJECTION_ACTION_INVALID');
      const tooLong = respond(handler, 'REJECTION_REASON_TOO_LONG');
      assert.equal(tooLong.status, 400);
      assert.match(tooLong.body?.message ?? '', /1000 caractères/);
    });
  }
});
