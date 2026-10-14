import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INTERNAL_ROLES, INTERNAL_ROLE_GROUP_LABELS, INTERNAL_ROLE_LABELS, internalRoleLabel } from '@aidn/shared';
import { assertValidRoles } from './users.roles.js';

describe('role assignment validation', () => {
  it('accepts every internal role, including assistant_dn', () => {
    for (const role of INTERNAL_ROLES) assert.doesNotThrow(() => assertValidRoles([role]));
    assert.doesNotThrow(() => assertValidRoles(['assistant_dn', 'dn_agent']));
  });

  it('rejects empty, duplicate and unknown roles', () => {
    assert.throws(() => assertValidRoles([]), /ROLES_REQUIRED/);
    assert.throws(() => assertValidRoles(['assistant_dn', 'assistant_dn']), /INVALID_ROLE/);
    assert.throws(() => assertValidRoles(['assistante_dn']), /INVALID_ROLE/);
  });
});

describe('métier role labels', () => {
  it('labels every internal role and group', () => {
    for (const role of INTERNAL_ROLES) {
      assert.ok(INTERNAL_ROLE_LABELS[role], `${role} has no label`);
      assert.ok(INTERNAL_ROLE_GROUP_LABELS[role], `${role} has no group label`);
    }
  });

  it('shows r3_agent / s5_agent under their validated names, keeps DN roles distinct', () => {
    assert.equal(internalRoleLabel('r3_agent'), 'Agent CI');
    assert.equal(internalRoleLabel('s5_agent'), 'Agent Finance');
    assert.equal(INTERNAL_ROLE_GROUP_LABELS.r3_agent, 'Cellule Inspection');
    assert.equal(INTERNAL_ROLE_GROUP_LABELS.s5_agent, 'Finance');
    assert.equal(internalRoleLabel('assistant_dn'), 'Assistante DN');
    assert.notEqual(internalRoleLabel('dn_agent'), internalRoleLabel('dn_supervisor'));
    assert.equal(internalRoleLabel('unknown_role'), 'unknown_role');
  });
});
