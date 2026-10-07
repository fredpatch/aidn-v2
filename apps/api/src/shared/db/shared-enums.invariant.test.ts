/** schema.ts says its enums are "kept aligned with packages/shared/src/
 *  statuses.ts - update both together". That rule was manual and drifted
 *  (PAYMENT_PROOF_STATUSES held 'pending' instead of the 3 real pre-validation
 *  states; REQUEST_STATUSES missed 'in_signature_circuit'). This test makes it
 *  mechanical: every shared constant that mirrors a DB enum must hold exactly
 *  the same values, read from drizzle's own enumValues (no source parsing). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPLICANT_CONTACT_ORDER,
  CERTIFICATE_STATUSES,
  DOCUMENT_TEMPLATE_KEYS,
  DOCUMENT_VERDICTS,
  DOSSIER_TERMINAL_STATUSES,
  INSPECTION_VERDICTS,
  INTERNAL_ROLES,
  MEETING_STATUSES,
  PAYMENT_PROOF_STATUSES,
  REQUEST_STATUSES,
} from '@aidn/shared';
import {
  applicantContactOrderEnum,
  certificateStatusEnum,
  dgCircuitStatusEnum,
  documentTemplateKeyEnum,
  documentVerdictEnum,
  inspectionVerdictEnum,
  internalRoleEnum,
  meetingStatusEnum,
  paymentProofStatusEnum,
  requestStatusEnum,
} from './schema.js';

const sorted = (values: readonly string[]) => [...values].sort();

const MIRRORS: Array<[string, readonly string[], { enumName: string; enumValues: readonly string[] }]> = [
  ['REQUEST_STATUSES', REQUEST_STATUSES, dgCircuitStatusEnum],
  ['MEETING_STATUSES', MEETING_STATUSES, meetingStatusEnum],
  ['DOCUMENT_TEMPLATE_KEYS', DOCUMENT_TEMPLATE_KEYS, documentTemplateKeyEnum],
  ['DOCUMENT_VERDICTS', DOCUMENT_VERDICTS, documentVerdictEnum],
  ['INSPECTION_VERDICTS', INSPECTION_VERDICTS, inspectionVerdictEnum],
  ['CERTIFICATE_STATUSES', CERTIFICATE_STATUSES, certificateStatusEnum],
  ['PAYMENT_PROOF_STATUSES', PAYMENT_PROOF_STATUSES, paymentProofStatusEnum],
  ['INTERNAL_ROLES', INTERNAL_ROLES, internalRoleEnum],
  ['APPLICANT_CONTACT_ORDER', APPLICANT_CONTACT_ORDER, applicantContactOrderEnum],
];

describe('@aidn/shared constants mirror the DB enums', () => {
  for (const [name, shared, pgEnum] of MIRRORS) {
    it(`${name} == ${pgEnum.enumName}`, () => {
      assert.deepEqual(sorted(shared), sorted(pgEnum.enumValues));
    });
  }

  it('DOSSIER_TERMINAL_STATUSES is a subset of request_status', () => {
    for (const status of DOSSIER_TERMINAL_STATUSES) {
      assert.ok(requestStatusEnum.enumValues.includes(status as never), `${status} is not a request_status`);
    }
  });
});
