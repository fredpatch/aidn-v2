import { describe, expect, it } from 'vitest';
import { courrier } from '../../test/courrierFixtures';
import { courrierCallout, courrierMetrics } from './courrierCopy';

const T = { dgAlertWorkingDays: 3, depositDays: 1 };

describe('courrierCallout (D7 wording)', () => {
  it('print / DG annotation / B6 hand-over / phase blocked / closed', () => {
    expect(courrierCallout(courrier(), T).title).toBe('Impression et mise en circuit DG');
    const dg = courrierCallout(courrier({ actionKey: 'record_dg_annotation', bucket: 'with_dg', signatureWorkingDays: 2 }), T);
    expect(dg.title).toBe('Annotation du DG attendue');
    expect(dg.description).toBe('En circuit DG depuis 2 j ouvrés (alerte au-delà de 3). Scannez le retour annoté dès réception.');
    expect(courrierCallout(courrier({ actionKey: 'handed_to_assistant_dn', bucket: 'returned' }), T).description)
      .toBe("Le dossier est transmis à l'Assistante DN pour le circuit Directeur DN.");
    expect(courrierCallout(courrier({ actionKey: 'handed_to_dn', bucket: 'returned' }), T).description).toBe('Le document est transmis à la DN.');
    expect(courrierCallout(courrier({ bucket: 'inactive', actionKey: 'none', blockReason: 'phase_not_open', source: 'pre_evaluation' }), T).blockReason)
      .toBe("La phase M3 n'est pas ouverte : aucune action du circuit possible.");
    expect(courrierCallout(courrier({ bucket: 'inactive', actionKey: 'none', blockReason: 'dossier_closed', dossierClosed: true }), T).title)
      .toBe('Dossier clos — consultation uniquement');
  });
  it('never says « signature »', () => {
    for (const actionKey of ['print_for_dg', 'record_dg_annotation', 'handed_to_assistant_dn', 'handed_to_dn'] as const) {
      const copy = courrierCallout(courrier({ actionKey }), T);
      expect(`${copy.title} ${copy.description}`).not.toMatch(/sign/i);
    }
  });
});

describe('courrierMetrics', () => {
  it('reads the action buckets only (never counts.inactive) and the rows for « 30 j »', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    const items = [
      courrier({ urgency: 'overdue' }),
      courrier({ id: 'b', bucket: 'with_dg', actionKey: 'record_dg_annotation', signatureWorkingDays: 4, urgency: 'overdue' }),
      courrier({ id: 'c', bucket: 'returned', actionKey: 'handed_to_dn', pendingReviewAt: '2026-10-10T09:00:00Z' }),
      courrier({ id: 'd', bucket: 'returned', actionKey: 'handed_to_dn', pendingReviewAt: '2026-08-01T09:00:00Z' }),
      courrier({ id: 'e', bucket: 'inactive', actionKey: 'none', blockReason: 'dossier_closed' }),
    ];
    const counts = { to_print: 1, with_dg: 1, returned: 2, inactive: 1 };
    expect(courrierMetrics(items, counts, now)).toEqual([
      { key: 'to_print', label: 'à imprimer', value: 1, detail: 'dont 1 en retard', tone: 'info' },
      { key: 'with_dg', label: 'retour DG attendu', value: 1, detail: 'dont 1 en retard · délai moyen 4 j ouvrés', tone: 'warning' },
      { key: 'returned_30', label: 'retours enregistrés (30 j)', value: 1, detail: null, tone: 'success' },
    ]);
  });
});
