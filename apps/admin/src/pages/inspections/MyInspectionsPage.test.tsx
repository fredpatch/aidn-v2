import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { queryKeys } from '../../lib/react-query/queryKeys';
import type { MyQueueItem } from '../../lib/api/site-inspection.types';
import { renderWithProviders } from '../../test/render';
import MyInspectionsPage from './MyInspectionsPage';

const AT = '2026-10-13T08:00:00.000Z';
const item = (over: Partial<MyQueueItem>): MyQueueItem => ({
  phaseId: 1, phaseStatus: 'open', openedAt: AT, closedAt: null, requestId: 1, requestReference: 'DEM-K-01',
  requestType: 'issuance', organisationName: 'OMA K', payment: null,
  siteVisit: { id: 1, r3AgentId: 5, scheduledAt: AT, location: 'Hangar', status: 'scheduled' },
  inspection: null, missionStatus: 'to_hold', statusLabel: 'Prevue', nextAction: 'mark_held',
  nextActionLabel: 'Marquer tenue', priority: 'haute', waitingDays: 0,
  dossierStatus: 'in_progress', dossierClosed: false, ...over,
});

function renderQueue(items: MyQueueItem[]) {
  renderWithProviders(<MyInspectionsPage />, { seed: [[queryKeys.siteInspection.myQueue(), items]] });
}
const row = (reference: string) => screen.getAllByText(reference)[0].closest('tr') as HTMLElement;

describe('<MyInspectionsPage> - priority computed by the API', () => {
  it('shows the priority next to the status of each open mission', () => {
    renderQueue([
      item({ phaseId: 1, requestReference: 'DEM-K-01', priority: 'haute' }),
      item({ phaseId: 2, requestReference: 'DEM-K-02', priority: 'moyenne' }),
      item({ phaseId: 3, requestReference: 'DEM-K-03', priority: 'basse', missionStatus: 'payment_pending', statusLabel: 'Paiement attendu' }),
    ]);
    expect(within(row('DEM-K-01')).getByText('Priorité haute')).toBeInTheDocument();
    expect(within(row('DEM-K-02')).getByText('Priorité moyenne')).toBeInTheDocument();
    expect(within(row('DEM-K-03')).getByText('Priorité basse')).toBeInTheDocument();
    expect(within(row('DEM-K-01')).getByText('Prevue')).toBeInTheDocument(); // status kept
  });

  it('a closed mission shows its status only (nothing left to rank)', () => {
    renderQueue([item({ requestReference: 'DEM-K-09', missionStatus: 'closed', statusLabel: 'Cloturee', priority: 'basse' })]);
    expect(within(row('DEM-K-09')).getByText('Cloturee')).toBeInTheDocument();
    expect(within(row('DEM-K-09')).queryByText(/Priorité/)).not.toBeInTheDocument();
  });
});
