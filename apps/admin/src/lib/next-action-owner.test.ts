import { describe, expect, it } from 'vitest';
import type { NextActionOwner } from '@aidn/shared';
import { canAct } from './next-action-owner';

const reception: NextActionOwner = { kind: 'staff', label: 'Réception', roles: ['assistant_dg', 'reception', 'SU'] };

describe('canAct', () => {
  it('staff owner: true when a session role is in the route roles (SU included)', () => {
    expect(canAct(reception, ['reception'])).toBe(true);
    expect(canAct(reception, ['SU'])).toBe(true);
    expect(canAct(reception, ['dn_agent'])).toBe(false);
  });
  it('applicant and external owners are never actionable from admin', () => {
    expect(canAct({ kind: 'applicant', label: 'Postulant' }, ['SU'])).toBe(false);
    expect(canAct({ kind: 'external', label: 'Directeur DN (circuit papier)' }, ['SU'])).toBe(false);
    expect(canAct(null, ['SU'])).toBe(false);
  });
});
