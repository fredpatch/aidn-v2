import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFileHeaders, resolveFileActor, resolveStoragePath } from './file-delivery.js';

describe('buildFileHeaders', () => {
  it('uses server-side metadata and the signed delivery mode', () => {
    const headers = buildFileHeaders({ mimeType: 'application/pdf', originalName: 'Manuel.pdf', sizeBytes: 1234 }, 'inline');
    assert.deepEqual(headers, {
      'Content-Type': 'application/pdf',
      'Content-Length': '1234',
      'Content-Disposition': "inline; filename=\"Manuel.pdf\"; filename*=UTF-8''Manuel.pdf",
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
  });

  it('forces a download for attachment grants, even for PDFs', () => {
    const headers = buildFileHeaders({ mimeType: 'application/pdf', originalName: 'a.pdf', sizeBytes: 1 }, 'attachment');
    assert.ok(headers['Content-Disposition'].startsWith('attachment;'));
  });

  it('encodes accented names and keeps a safe ASCII fallback', () => {
    const headers = buildFileHeaders(
      { mimeType: 'application/pdf', originalName: 'Manuel qualité "final" (2).pdf', sizeBytes: 1 },
      'attachment'
    );
    assert.equal(
      headers['Content-Disposition'],
      "attachment; filename=\"Manuel qualite _final_ (2).pdf\"; filename*=UTF-8''Manuel%20qualit%C3%A9%20%22final%22%20%282%29.pdf"
    );
  });

  it('strips path separators and control characters from the name', () => {
    const headers = buildFileHeaders({ mimeType: 'image/png', originalName: '..\\..\\etc/pass\r\nwd.png', sizeBytes: 1 }, 'inline');
    assert.ok(!/[\\/\r\n]/.test(headers['Content-Disposition'].split(';')[1]), headers['Content-Disposition']);
  });
});

describe('resolveStoragePath', () => {
  const root = process.platform === 'win32' ? 'C:\\data\\uploads' : '/data/uploads';

  it('resolves a storage key inside the uploads root', () => {
    assert.ok(resolveStoragePath(root, '2026/09/25/admin/misc/a.pdf')?.startsWith(root));
  });

  it('refuses keys that escape the root or are empty', () => {
    for (const key of ['../secret', '2026/../../x', '', '/', '..']) {
      assert.equal(resolveStoragePath(root, key), null, key);
    }
  });
});

describe('resolveFileActor', () => {
  const origins = { adminOrigin: 'http://admin.test', portalOrigin: 'http://portal.test' };
  const staffSession = { kind: 'staff' as const, userId: 1, employeeCode: 'E1', roles: ['SU'] };
  const applicantSession = { kind: 'applicant' as const, applicantId: 7, organisationId: 3, email: 'a@b.c' };

  it('uses the only valid session', () => {
    assert.deepEqual(resolveFileActor({ staff: staffSession, applicant: null, origin: undefined, ...origins }), {
      actor: { kind: 'staff', userId: 1, roles: ['SU'] },
    });
    assert.deepEqual(resolveFileActor({ staff: null, applicant: applicantSession, origin: undefined, ...origins }), {
      actor: { kind: 'applicant', applicantId: 7 },
    });
  });

  it('uses a trusted Origin to choose between two valid sessions', () => {
    assert.equal(
      resolveFileActor({ staff: staffSession, applicant: applicantSession, origin: 'http://admin.test', ...origins }).actor?.kind,
      'staff'
    );
    assert.equal(
      resolveFileActor({ staff: staffSession, applicant: applicantSession, origin: 'http://portal.test', ...origins }).actor?.kind,
      'applicant'
    );
  });

  it('rejects two valid sessions when the Origin is missing, unknown or unconfigured', () => {
    for (const input of [
      { origin: undefined, ...origins },
      { origin: 'http://evil.test', ...origins },
      { origin: 'http://admin.test', adminOrigin: undefined, portalOrigin: undefined },
    ]) {
      assert.deepEqual(resolveFileActor({ staff: staffSession, applicant: applicantSession, ...input }), { error: 'ambiguous' });
    }
  });

  it('reports no session as unauthenticated', () => {
    assert.deepEqual(resolveFileActor({ staff: null, applicant: null, origin: undefined, ...origins }), { error: 'unauthenticated' });
  });
});

describe('redactFileGrant', () => {
  it('removes grant values from logged URLs', async () => {
    const { redactFileGrant } = await import('./file-delivery.js');
    assert.equal(redactFileGrant('/api/files/12/content?grant=abc.def'), '/api/files/12/content?grant=[redacted]');
    assert.equal(redactFileGrant('/api/files/12/content?x=1&grant=abc.def&y=2'), '/api/files/12/content?x=1&grant=[redacted]&y=2');
    assert.equal(redactFileGrant('/api/requests?page=2'), '/api/requests?page=2');
  });
});
