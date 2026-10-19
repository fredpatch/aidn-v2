import { describe, expect, it } from 'vitest';
import { dnInactive, dnReturned, dnTask, dnWithDirector } from '../../test/dnFixtures';
import {
  DN_CIRCUIT_TABS,
  DN_CIRCUIT_TAB_MODES,
  dnCircuitCallout,
  dnCircuitMetrics,
} from './dnCircuitCopy';

describe('dnCircuitCallout', () => {
  it('names the step for each action key', () => {
    expect(dnCircuitCallout(dnTask()).title).toBe('À transmettre au Directeur DN');
    expect(dnCircuitCallout(dnWithDirector({ directorWorkingDays: 4 })).description).toBe(
      'Le dossier est chez le Directeur DN depuis 4 j ouvrés. Téléversez le retour annoté dès réception.'
    );
    expect(dnCircuitCallout(dnWithDirector({ directorWorkingDays: null })).description).toBe(
      'Le dossier est chez le Directeur DN. Téléversez le retour annoté dès réception.'
    );
    expect(dnCircuitCallout(dnReturned()).description).toBe(
      'Annotation du Directeur DN reçue. La DN peut ouvrir la phase préliminaire.'
    );
  });

  it('a closed dossier is consultation only', () => {
    expect(dnCircuitCallout(dnInactive()).title).toBe('Dossier clos - consultation uniquement');
  });
});

describe('tabs', () => {
  it('maps the waiting tab to « waiting » mode and offers no tab for inactive', () => {
    expect(DN_CIRCUIT_TAB_MODES.with_director).toBe('waiting');
    expect(DN_CIRCUIT_TABS.map((t) => t.key)).toEqual([
      'to_send',
      'with_director',
      'returned',
      'all',
    ]);
  });
});

describe('dnCircuitMetrics', () => {
  const now = new Date('2026-10-10T09:00:00.000Z');
  it('reads counts for the action tabs, never inactive; returned is a 30-day window', () => {
    const items = [
      dnTask(),
      dnWithDirector({ id: 'b', directorWorkingDays: 2 }),
      dnReturned({ id: 'c', returnedAt: '2026-10-05T09:00:00.000Z' }),
      dnReturned({ id: 'old', returnedAt: '2026-08-01T09:00:00.000Z' }),
      dnInactive({ id: 'd' }),
      dnInactive({ id: 'e' }),
      dnInactive({ id: 'f' }),
    ];
    const metrics = dnCircuitMetrics(
      items,
      { to_send: 1, with_director: 1, returned: 2, inactive: 3 },
      now
    );
    expect(metrics.map((m) => m.value)).toEqual([1, 1, 1]);
    expect(metrics[1].detail).toBe('délai moyen 2 j ouvrés');
  });
});
