/** SESSION1-COCKPIT-1 §9 - where each user lands on « / ». DN roles and SU
 *  keep the DN dashboard; a non-DN user lands on their work queue, with a
 *  fixed precedence when several apply. Pure. */
export type QueuePath = '/paiements-s5' | '/mes-inspections' | '/courriers' | '/circuit-directeur-dn';
export type Home = { kind: 'dn_dashboard' } | { kind: 'queue'; path: QueuePath } | { kind: 'denied' };

export function homeFor(roles: readonly string[]): Home {
  const has = (role: string) => roles.includes(role);
  if (has('dn_agent') || has('dn_supervisor') || has('SU')) return { kind: 'dn_dashboard' };
  if (has('s5_agent')) return { kind: 'queue', path: '/paiements-s5' };
  if (has('r3_agent')) return { kind: 'queue', path: '/mes-inspections' };
  if (has('reception') || has('assistant_dg')) return { kind: 'queue', path: '/courriers' };
  if (has('assistant_dn')) return { kind: 'queue', path: '/circuit-directeur-dn' };
  return { kind: 'denied' };
}

/** D5 - Assistant DG alone starts on « Retour DG attendu »; anyone else
 *  (Réception, both roles, SU) on « À imprimer ». */
export function courrierDefaultTab(roles: readonly string[]): 'to_print' | 'with_dg' {
  return roles.includes('assistant_dg') && !roles.includes('reception') && !roles.includes('SU') ? 'with_dg' : 'to_print';
}
