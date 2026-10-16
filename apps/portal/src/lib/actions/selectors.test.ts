import { describe, expect, it } from 'vitest';
import type { ApplicantAction } from '@aidn/shared';
import { actionHref, dossierActions, topDossierAction, topPhaseAction } from './selectors';

const a = (over: Partial<ApplicantAction>): ApplicantAction => ({
  id: 'payment_proof:4:1', key: 'payment_proof', requestId: 4, requestReference: 'DEM-A', phaseCode: 'M5',
  priority: 20, urgent: false, anchor: 'paiement-M5', dueAt: null, ...over,
});

describe('action selectors', () => {
  it('href: dossier pathname and the anchor hash', () => {
    expect(actionHref(a({ requestId: 7, anchor: 'rendez-vous-12' }))).toEqual({ pathname: '/dossiers/7', hash: '#rendez-vous-12' });
  });
  it('dossier and phase selectors keep the server order and never re-sort', () => {
    const list = [a({ id: 'x', priority: 90 }), a({ id: 'y', priority: 10 }), a({ id: 'z', requestId: 5 })];
    expect(dossierActions(list, 4).map((x) => x.id)).toEqual(['x', 'y']);
    expect(topDossierAction(list, 4)?.id).toBe('x');
    expect(topPhaseAction(list, 4, 'M3')).toBeUndefined();
    expect(topPhaseAction(list, 4, 'M5')?.id).toBe('x');
  });
});
