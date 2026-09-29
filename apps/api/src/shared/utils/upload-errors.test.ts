import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import {
  handleCertificatesError,
  handleDeepEvaluationError,
  handleDocumentTemplatesError,
  handleFormalRequestError,
  handleMeetingsError,
  handlePhasesError,
  handlePreliminaryEvaluationError,
  handleRequestsError,
  handleSiteInspectionError,
} from './error.js';

function capture(handler: (res: Response, error: unknown) => void, code: string) {
  let status = 0;
  let body: unknown;
  const res = {
    status(value: number) {
      status = value;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as Response;
  handler(res, new Error(code));
  return { status, body };
}

const WORKFLOW_HANDLERS = {
  handleRequestsError,
  handlePhasesError,
  handleMeetingsError,
  handlePreliminaryEvaluationError,
  handleFormalRequestError,
  handleDeepEvaluationError,
  handleSiteInspectionError,
  handleCertificatesError,
  handleDocumentTemplatesError,
};

describe('upload attachment errors', () => {
  it('not found, not owned and invalid source give one identical response (no existence leak)', () => {
    for (const [name, handler] of Object.entries(WORKFLOW_HANDLERS)) {
      const responses = ['UPLOAD_ASSET_NOT_FOUND', 'UPLOAD_ASSET_NOT_OWNED', 'UPLOAD_ASSET_INVALID_SOURCE'].map((code) =>
        capture(handler, code)
      );
      for (const response of responses) {
        assert.deepEqual(response, {
          status: 400,
          body: { message: 'Fichier introuvable. Merci de le téléverser à nouveau.', code: 'UPLOAD_ASSET_UNAVAILABLE' },
        }, name);
      }
    }
  });

  it('every workflow handler maps the attachment codes', () => {
    const expected: Record<string, number> = {
      UPLOAD_ASSET_REQUIRED: 400,
      UPLOAD_ASSET_ID_INVALID: 400,
      UPLOAD_ASSET_INVALID_OWNER: 400,
      UPLOAD_ASSET_ALREADY_LINKED: 409,
      UPLOAD_ASSET_ORPHANED: 409,
      UPLOAD_FILE_MISSING: 409,
    };
    for (const [name, handler] of Object.entries(WORKFLOW_HANDLERS)) {
      for (const [code, status] of Object.entries(expected)) {
        const response = capture(handler, code);
        assert.equal(response.status, status, `${name} ${code}`);
        assert.equal((response.body as { code: string }).code, code, `${name} ${code}`);
      }
    }
  });
});
