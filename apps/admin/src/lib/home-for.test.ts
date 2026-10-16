import { describe, expect, it } from 'vitest';
import { courrierDefaultTab, homeFor } from './home-for';

describe('homeFor (spec §9)', () => {
  const cases: Array<[string[], ReturnType<typeof homeFor>]> = [
    [['dn_agent'], { kind: 'dn_dashboard' }],
    [['dn_supervisor', 's5_agent'], { kind: 'dn_dashboard' }],
    [['SU'], { kind: 'dn_dashboard' }],
    [['SU', 'r3_agent'], { kind: 'dn_dashboard' }],
    [['s5_agent'], { kind: 'queue', path: '/paiements-s5' }],
    [['r3_agent'], { kind: 'queue', path: '/mes-inspections' }],
    [['reception'], { kind: 'queue', path: '/courriers' }],
    [['assistant_dg'], { kind: 'queue', path: '/courriers' }],
    [['assistant_dn'], { kind: 'queue', path: '/circuit-directeur-dn' }],
    [['assistant_dn', 's5_agent'], { kind: 'queue', path: '/paiements-s5' }],
    [['r3_agent', 'reception'], { kind: 'queue', path: '/mes-inspections' }],
    [['reception', 'assistant_dn'], { kind: 'queue', path: '/courriers' }],
    [['s5_agent', 'r3_agent', 'reception', 'assistant_dn'], { kind: 'queue', path: '/paiements-s5' }],
    [[], { kind: 'denied' }],
  ];
  for (const [roles, home] of cases) {
    it(`${roles.join('+') || 'no role'} → ${JSON.stringify(home)}`, () => expect(homeFor(roles)).toEqual(home));
  }
});

describe('courrierDefaultTab (D5)', () => {
  it('Assistant DG alone → Retour DG attendu; anyone else → À imprimer', () => {
    expect(courrierDefaultTab(['assistant_dg'])).toBe('with_dg');
    expect(courrierDefaultTab(['reception'])).toBe('to_print');
    expect(courrierDefaultTab(['reception', 'assistant_dg'])).toBe('to_print');
    expect(courrierDefaultTab(['SU'])).toBe('to_print');
    expect(courrierDefaultTab(['SU', 'assistant_dg'])).toBe('to_print');
  });
});
