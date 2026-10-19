import { describe, expect, it } from 'vitest';
import { OPERATIONAL_OWNERS } from '@aidn/shared';
import { mission } from '../../test/inspectionFixtures';
import { INSPECTION_TAB_MODES, inspectionCallout, inspectionMetrics } from './inspectionCopy';

const COUNTS = { to_hold: 3, verdict_due: 2, awaiting_payment: 1, closed: 4, inactive: 9 };

describe('inspectionCallout', () => {
  it('callouts', () => {
    const blocked = inspectionCallout(
      mission({
        bucket: 'awaiting_payment',
        actionKey: 'await_payment',
        state: 'blocked',
        blockReason: 'payment_not_validated',
        owner: OPERATIONAL_OWNERS.finance,
      })
    );
    expect(blocked.title).toBe('Paiement en attente');
    expect(blocked.blockReason).toBe(
      'La visite pourra être enregistrée une fois le paiement validé par Finance.'
    );
    expect(inspectionCallout(mission({ actionKey: 'record_visit_held' })).title).toBe(
      'Visite à enregistrer'
    );
    expect(
      inspectionCallout(mission({ actionKey: 'submit_verdict', bucket: 'verdict_due' })).description
    ).toBe("La visite est tenue. L'avis d'inspection doit être enregistré.");
  });

  it('a closed dossier is consultation only, whatever the action', () => {
    const copy = inspectionCallout(
      mission({
        bucket: 'inactive',
        actionKey: 'none',
        blockReason: 'dossier_closed',
        dossierClosed: true,
      })
    );
    expect(copy.title).toBe('Dossier clos - consultation uniquement');
    expect(copy.blockReason).toBeNull();
  });

  it('closed and non-held missions', () => {
    expect(inspectionCallout(mission({ bucket: 'closed', actionKey: 'none' })).title).toBe(
      'Mission clôturée'
    );
    expect(inspectionCallout(mission({ bucket: 'inactive', actionKey: 'none' })).title).toBe(
      'Visite non tenue'
    );
  });
});

describe('inspectionMetrics', () => {
  it('« Visites à enregistrer » counts the overdue ones as « passées »; inactive never read', () => {
    const metrics = inspectionMetrics(
      [
        mission({ urgency: 'overdue' }),
        mission({ id: 'site_visit:2', urgency: 'normal' }),
        mission({ id: 'site_visit:3', bucket: 'verdict_due', urgency: 'overdue' }),
      ],
      COUNTS
    );
    expect(metrics.map((m) => [m.key, m.value])).toEqual([
      ['to_hold', 3],
      ['verdict_due', 2],
      ['awaiting_payment', 1],
    ]);
    expect(metrics[0].detail).toBe('dont 1 passées');
    expect(metrics[1].detail).toBeNull();
    expect(metrics.some((m) => m.value === 9)).toBe(false);
    expect(inspectionMetrics([mission()], COUNTS)[0].detail).toBeNull();
  });
});

describe('INSPECTION_TAB_MODES', () => {
  it('awaiting_payment is a waiting tab', () => {
    expect(INSPECTION_TAB_MODES.awaiting_payment).toBe('waiting');
    expect(INSPECTION_TAB_MODES.to_hold).toBe('action');
  });
});
