/** D1 - Demandes cockpit, two panes: exclusive tabs, a reading pane that only
 *  shows a listed dossier, ?id= selection, keyboard navigation, and no
 *  workflow action on a closed dossier (K7). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { api } from '../../lib/axios';
import type { RequestCockpitItem, RequestCockpitSummary } from '../../lib/api/requests.types';
import { renderWithProviders } from '../../test/render';
import RequestsPage from './RequestsPage';

const item = (over: Partial<RequestCockpitItem>): RequestCockpitItem => ({
  id: 1,
  reference: 'DEM-D1-01',
  requestType: 'issuance',
  requestTypeLabel: 'Delivrance',
  status: 'in_progress',
  statusLabel: 'En cours',
  circuitStatus: 'completed',
  circuitStatusLabel: 'Circuit termine',
  createdAt: '2026-10-05T09:00:00.000Z',
  updatedAt: '2026-10-05T09:00:00.000Z',
  organisationName: 'OMA Un',
  organisationEmail: null,
  organisationPhone: null,
  applicantName: 'Jean Test',
  applicantEmail: 'jean@test.ga',
  applicantPhone: null,
  currentPhaseCode: 'M4',
  currentPhaseLabel: 'Demande formelle',
  phases: [],
  documentSummary: { completed: 0, missing: 0, pending: 0, total: 0 },
  nextActionLabel: 'Poursuivre Demande formelle',
  nextActionDescription: 'Continuer le traitement depuis la phase ouverte.',
  nextActionHref: '/demandes/1/phase-formelle',
  nextActionTone: 'info',
  canStartPreliminary: false,
  activity: [],
  ...over,
});

const ITEMS = [
  item({
    id: 1,
    reference: 'DEM-D1-01',
    organisationName: 'OMA Un',
    createdAt: '2026-10-05T09:00:00.000Z',
  }),
  item({
    id: 2,
    reference: 'DEM-D1-02',
    organisationName: 'OMA Deux',
    status: 'pending_review',
    circuitStatus: 'pending_review',
    createdAt: '2026-10-04T09:00:00.000Z',
    nextActionLabel: 'Ouvrir la phase preliminaire',
    nextActionHref: '/demandes/2/phase-preliminaire',
    canStartPreliminary: true,
  }),
  item({
    id: 3,
    reference: 'DEM-D1-03',
    organisationName: 'OMA Trois',
    status: 'rejected',
    statusLabel: 'Rejete',
    circuitStatus: 'submitted',
    createdAt: '2026-10-03T09:00:00.000Z',
    nextActionLabel: 'Dossier rejete',
    nextActionHref: null,
    nextActionTone: 'danger',
  }),
  item({
    id: 4,
    reference: 'DEM-D1-04',
    organisationName: 'OMA Quatre',
    status: 'completed',
    statusLabel: 'Termine',
    createdAt: '2026-10-02T09:00:00.000Z',
    nextActionLabel: 'Workflow termine',
    nextActionHref: '/demandes/4/delivrance',
    nextActionTone: 'success',
  }),
];

let cockpit: RequestCockpitSummary;
beforeEach(() => {
  cockpit = { metrics: [], items: ITEMS, updatedAt: '2026-10-09T08:00:00.000Z' };
  vi.spyOn(api, 'get').mockImplementation(async () => ({ data: cockpit }));
});
afterEach(() => vi.restoreAllMocks());

function renderPage(route = '/demandes') {
  return renderWithProviders(
    <Routes>
      <Route path="/demandes" element={<RequestsPage />} />
      <Route path="/demandes/:id/:phase" element={<p>Page de phase</p>} />
    </Routes>,
    { route }
  );
}

const pane = () => screen.getByRole('article');
const tab = (name: RegExp) => screen.getByRole('button', { name });

describe('<RequestsPage> (D1)', () => {
  it('tabs are exclusive: a rejected dossier is under « Clôturées », not « À traiter » or « En attente DG »', async () => {
    renderPage();
    await screen.findByRole('listbox');
    expect(tab(/^Toutes/)).toHaveTextContent('4');
    expect(tab(/^À traiter/)).toHaveTextContent('2');
    expect(tab(/^En attente DG/)).toHaveTextContent('0');
    expect(tab(/^Clôturées/)).toHaveTextContent('2');

    fireEvent.click(tab(/^Clôturées/));
    const options = screen.getAllByRole('option');
    expect(options.map((o) => within(o).getByText(/^DEM-D1/).textContent)).toEqual([
      'DEM-D1-03 · Delivrance',
      'DEM-D1-04 · Delivrance',
    ]);
  });

  it('?id= selects the dossier; an unknown id falls back to the first listed row', async () => {
    renderPage('/demandes?id=4');
    expect(
      await within(await screen.findByRole('article')).findByRole('heading', { name: 'DEM-D1-04' })
    ).toBeInTheDocument();
  });

  it('an unknown id or an empty view never shows a dossier outside the list', async () => {
    renderPage('/demandes?id=999');
    expect(
      await within(await screen.findByRole('article')).findByRole('heading', { name: 'DEM-D1-01' })
    ).toBeInTheDocument();

    fireEvent.click(tab(/^En attente DG/));
    expect(screen.getByText('Aucune demande dans cette vue')).toBeInTheDocument();
    expect(within(pane()).getByText('Aucune demande sélectionnée')).toBeInTheDocument();
    expect(within(pane()).queryByRole('heading', { name: /DEM-D1/ })).not.toBeInTheDocument();
  });

  it('↑/↓ move the selection; Entrée opens the phase of a dossier to treat', async () => {
    renderPage();
    const first = (await screen.findAllByRole('option'))[0];
    expect(first).toHaveAttribute('aria-selected', 'true');
    first.focus();

    fireEvent.keyDown(first, { key: 'ArrowDown' });
    const second = screen.getAllByRole('option')[1];
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(second).toHaveFocus();
    expect(within(pane()).getByRole('heading', { name: 'DEM-D1-02' })).toBeInTheDocument();

    fireEvent.keyDown(second, { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getAllByRole('option')[0], { key: 'Enter' });
    expect(await screen.findByText('Page de phase')).toBeInTheDocument();
  });

  it('Entrée on a dossier ready to open only focuses « Ouvrir la phase préliminaire » (no state change)', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: null });
    renderPage('/demandes?id=2');
    const row = (await screen.findAllByRole('option'))[1];
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Ouvrir la phase préliminaire' })).toHaveFocus();
    expect(post).not.toHaveBeenCalled();
  });

  it('closed dossier (K7): no workflow action; a completed one can still be consulted', async () => {
    renderPage('/demandes?id=3');
    await within(await screen.findByRole('article')).findByRole('heading', { name: 'DEM-D1-03' });
    expect(within(pane()).getByText('Dossier rejeté')).toBeInTheDocument();
    expect(within(pane()).queryByRole('link')).not.toBeInTheDocument();
    expect(
      within(pane()).queryByRole('button', { name: /Ouvrir la phase/ })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('option')[3]);
    expect(within(pane()).getByRole('heading', { name: 'DEM-D1-04' })).toBeInTheDocument();
    expect(within(pane()).getByRole('link', { name: /Consulter le dossier/ })).toHaveAttribute(
      'href',
      '/demandes/4/delivrance'
    );
    expect(within(pane()).queryByRole('link', { name: /Traiter/ })).not.toBeInTheDocument();
  });

  it('/ focuses the search box', async () => {
    renderPage();
    const row = (await screen.findAllByRole('option'))[0];
    fireEvent.keyDown(row, { key: '/' });
    expect(screen.getByRole('searchbox', { name: 'Rechercher une demande' })).toHaveFocus();
  });
});
