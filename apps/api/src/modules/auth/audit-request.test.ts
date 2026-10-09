/** D3a - the action -> entity map (audit-request.ts) and the history backfill
 *  of migration 0005 must use the same action lists: a new dossier action
 *  added to the map without the migration (or the reverse) fails here. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AUDIT_ENTITY_BY_ACTION, auditEntityKind } from './audit-request.js';

const migration = readFileSync(
  fileURLToPath(new URL('../../../drizzle/0005_d3a_audit_request.sql', import.meta.url)),
  'utf8'
);

/** Actions quoted in the backfill statements, e.g. 'PAYMENT_VALIDATED'. */
const backfilled = new Set([...migration.matchAll(/'([A-Z][A-Z_]+)'/g)].map((m) => m[1]));

describe('D3a audit -> request map', () => {
  it('every mapped action is backfilled by migration 0005, and nothing else', () => {
    assert.deepEqual([...backfilled].sort(), Object.keys(AUDIT_ENTITY_BY_ACTION).sort());
  });

  it('MEETING_<status> is a meeting event; account, user and auth events stay unlinked', () => {
    assert.equal(auditEntityKind('MEETING_NO_SHOW'), 'meeting');
    assert.equal(auditEntityKind('PAYMENT_VALIDATED'), 'payment');
    for (const action of [
      'ACCOUNT_REQUEST_APPROVED',
      'LOGIN',
      'USER_CREATED',
      'PARAMETER_UPDATED',
    ]) {
      assert.equal(auditEntityKind(action), null, action);
    }
  });
});
