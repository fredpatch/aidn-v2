import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFileGrant, FILE_GRANT_TTL_SECONDS, verifyFileGrant } from './file-grant.js';

const SECRET = 'test-grant-secret';
const NOW = new Date('2026-09-25T12:00:00Z');
const actor = { kind: 'staff' as const, userId: 4, roles: ['dn_agent'] };

function grant(disposition: 'inline' | 'attachment' = 'inline', assetId = 183) {
  return createFileGrant({ assetId, actor, disposition, secret: SECRET, now: NOW });
}

function b64(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('file grants', () => {
  it('round-trips and carries the delivery mode', () => {
    for (const d of ['inline', 'attachment'] as const) {
      const { token, expiresAt } = grant(d);
      assert.equal(expiresAt.getTime(), NOW.getTime() + FILE_GRANT_TTL_SECONDS * 1000);
      assert.deepEqual(verifyFileGrant(token, 183, { secret: SECRET, now: NOW }), { disposition: d });
    }
  });

  it('lasts five minutes', () => {
    assert.equal(FILE_GRANT_TTL_SECONDS, 300);
    const { token } = grant();
    const justBefore = new Date(NOW.getTime() + 299_000);
    const after = new Date(NOW.getTime() + 300_000);
    assert.notEqual(verifyFileGrant(token, 183, { secret: SECRET, now: justBefore }), null);
    assert.equal(verifyFileGrant(token, 183, { secret: SECRET, now: after }), null);
  });

  it('rejects a grant for another asset', () => {
    assert.equal(verifyFileGrant(grant().token, 184, { secret: SECRET, now: NOW }), null);
  });

  it('rejects a grant signed with another secret', () => {
    assert.equal(verifyFileGrant(grant().token, 183, { secret: 'other', now: NOW }), null);
  });

  it('rejects a tampered payload or signature', () => {
    const [payload, signature] = grant().token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const forged = b64({ ...decoded, d: 'attachment' });
    assert.equal(verifyFileGrant(`${forged}.${signature}`, 183, { secret: SECRET, now: NOW }), null);
    const flipped = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
    assert.equal(verifyFileGrant(`${payload}.${flipped}`, 183, { secret: SECRET, now: NOW }), null);
  });

  it('rejects malformed tokens without throwing', () => {
    for (const token of ['', 'abc', 'a.b.c', '.', `${b64({})}.`, '%%%.%%%', undefined as unknown as string]) {
      assert.equal(verifyFileGrant(token, 183, { secret: SECRET, now: NOW }), null, String(token));
    }
  });

  it('rejects an unknown version or delivery mode even when correctly signed', async () => {
    const { signPayloadForTest } = await import('./file-grant.js');
    const exp = Math.floor(NOW.getTime() / 1000) + 60;
    const badVersion = signPayloadForTest({ v: 2, a: 183, e: exp, s: 'staff:4', d: 'inline' }, SECRET);
    const badMode = signPayloadForTest({ v: 1, a: 183, e: exp, s: 'staff:4', d: 'download' }, SECRET);
    assert.equal(verifyFileGrant(badVersion, 183, { secret: SECRET, now: NOW }), null);
    assert.equal(verifyFileGrant(badMode, 183, { secret: SECRET, now: NOW }), null);
  });

  it('records the actor and never contains a storage path', () => {
    const [payload] = grant().token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    assert.deepEqual(Object.keys(decoded).sort(), ['a', 'd', 'e', 's', 'v']);
    assert.equal(decoded.s, 'staff:4');
    const applicantGrant = createFileGrant({
      assetId: 183,
      actor: { kind: 'applicant', applicantId: 9 },
      disposition: 'inline',
      secret: SECRET,
      now: NOW,
    });
    assert.equal(JSON.parse(Buffer.from(applicantGrant.token.split('.')[0], 'base64url').toString()).s, 'applicant:9');
  });
});
