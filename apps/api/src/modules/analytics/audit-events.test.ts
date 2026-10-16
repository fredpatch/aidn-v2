/** ROLE-ANALYTICS-1B - the event catalogue matches the real emitters. Static
 *  source scan (no database): a current action must still be emitted as an
 *  `action:` literal somewhere in modules/, a legacy one must not be. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLE_ANALYTICS_EVENT_KEYS } from '@aidn/shared';
import { AUDIT_ENTITY_BY_ACTION } from '../auth/audit-request.js';
import { AUDIT_EVENT_CATALOGUE, actionsFor, eventForAction } from './audit-events.js';

const modulesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

const emitted = new Set<string>();
for (const file of sources(modulesDir)) {
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/action:\s*['"]([A-Z_]+)['"]/g)) emitted.add(match[1]);
}

describe('audit event catalogue', () => {
  it('covers every shared event key and nothing else', () => {
    assert.deepEqual(Object.keys(AUDIT_EVENT_CATALOGUE).sort(), [...ROLE_ANALYTICS_EVENT_KEYS].sort());
  });

  it('pins the current and legacy actions', () => {
    assert.deepEqual(actionsFor('courrier.sent_to_dg'), ['COURRIER_SENT_TO_SIGNATURE', 'DG_CIRCUIT_SENT_TO_SIGNATURE']);
    assert.deepEqual(actionsFor('courrier.dg_return_recorded'), [
      'DG_ANNOTATION_RETURNED',
      'COURRIER_SIGNED_RETURNED',
      'FORMAL_LETTER_SIGNED',
      'DG_CIRCUIT_SIGNED',
      'DG_CIRCUIT_SIGNED_RETURNED',
    ]);
    assert.deepEqual(actionsFor('dn_circuit.sent_to_director'), ['DN_ANNOTATION_SENT_TO_DIRECTOR']);
    assert.deepEqual(actionsFor('dn_circuit.return_recorded'), ['DN_ANNOTATION_RETURNED']);
    assert.deepEqual(actionsFor('finance.invoice_uploaded'), ['INVOICE_UPLOADED']);
    assert.deepEqual(actionsFor('finance.proof_uploaded'), ['PAYMENT_PROOF_UPLOADED']);
    assert.deepEqual(actionsFor('finance.payment_validated'), ['PAYMENT_VALIDATED']);
    assert.deepEqual(actionsFor('finance.payment_rejected'), ['PAYMENT_REJECTED']);
    assert.deepEqual(actionsFor('inspection.visit_held'), ['SITE_VISIT_HELD']);
    assert.deepEqual(actionsFor('inspection.verdict_submitted'), ['INSPECTION_VERDICT_SUBMITTED']);
  });

  it('every current action is still emitted by the code', () => {
    for (const definition of Object.values(AUDIT_EVENT_CATALOGUE)) {
      for (const action of definition.current) assert.ok(emitted.has(action), `${action} has no emitter`);
    }
  });

  it('legacy actions are no longer emitted (otherwise they are current)', () => {
    for (const definition of Object.values(AUDIT_EVENT_CATALOGUE)) {
      for (const action of definition.legacy) assert.ok(!emitted.has(action), `${action} is still emitted`);
    }
  });

  it('no action belongs to two events', () => {
    const seen = new Map<string, string>();
    for (const event of ROLE_ANALYTICS_EVENT_KEYS) {
      for (const action of actionsFor(event)) {
        assert.ok(!seen.has(action), `${action} is in ${seen.get(action)} and ${event}`);
        seen.set(action, event);
        assert.equal(eventForAction(action), event);
      }
    }
    assert.equal(eventForAction('MEETING_HELD'), null);
    assert.equal(eventForAction('FORMAL_LETTER_TRANSMITTED'), null);
  });

  it('every catalogued action links to its dossier (AUDIT_ENTITY_BY_ACTION)', () => {
    for (const event of ROLE_ANALYTICS_EVENT_KEYS) {
      for (const action of actionsFor(event)) assert.ok(action in AUDIT_ENTITY_BY_ACTION, `${action} has no dossier link`);
    }
  });
});
