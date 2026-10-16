/** SESSION1-COCKPIT-1 - Cellule Inspection cockpit: landing tab, CTA gated by
 *  canAct AND assignedToViewer, waiting grouping, verdict form, 7-day strip,
 *  aging badges. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { OPERATIONAL_OWNERS } from '@aidn/shared';
import { api } from '../../lib/axios';
import type { InspectionQueueItem } from '../../lib/api/site-inspection.types';
import { renderWithProviders } from '../../test/render';
import { mission } from '../../test/inspectionFixtures';
import MyInspectionsPage from './MyInspectionsPage';

let roles = ['r3_agent'];
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles } }) }));

const COUNTS = { to_hold: 0, verdict_due: 0, awaiting_payment: 0, closed: 0, inactive: 0 };
const queue = (items: InspectionQueueItem[], counts: Partial<typeof COUNTS> = {}) => ({ data: { items, counts: { ...COUNTS, ...counts } } });
const verdictDue = (n: number, over: Partial<InspectionQueueItem> = {}) =>
  mission({ id: `site_visit:${n}`, phaseId: n, requestReference: `DEM-CI-0${n}`, bucket: 'verdict_due', actionKey: 'submit_verdict', ...over });
const unpaid = (n: number, over: Partial<InspectionQueueItem> = {}) =>
  mission({
    id: `site_visit:${n}`, phaseId: n, requestReference: `DEM-CI-0${n}`, bucket: 'awaiting_payment', actionKey: 'await_payment', state: 'blocked',
    blockReason: 'payment_not_validated', owner: OPERATIONAL_OWNERS.finance, ...over,
  });

const renderPage = (route = '/mes-inspections') => renderWithProviders(<MyInspectionsPage />, { route });
const pane = () => screen.getByRole('article');
const tabBtn = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  roles = ['r3_agent'];
  vi.spyOn(api, 'get').mockResolvedValue(queue([mission()], { to_hold: 1 }));
  vi.spyOn(api, 'patch').mockResolvedValue({ data: null });
  vi.spyOn(api, 'post').mockResolvedValue({ data: null });
});
afterEach(() => vi.restoreAllMocks());

describe('<MyInspectionsPage> cockpit', () => {
  it('lands on « Visites à enregistrer »; the assigned agent gets « Enregistrer la tenue »', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(queue([mission(), verdictDue(2)], { to_hold: 1, verdict_due: 1 }));
    renderPage();
    await screen.findAllByRole('option');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mes inspections');
    expect(within(pane()).getByText('Prévue')).toBeInTheDocument();
    expect(within(pane()).queryByText('Planifiée')).not.toBeInTheDocument();
    expect(tabBtn(/^Visites à enregistrer/)).toHaveClass('border-anac-blue');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.click(within(pane()).getByRole('button', { name: 'Enregistrer la tenue' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/site-inspection/site-visits/11/held'));
  });

  it('an unpaid mission shows « Paiement en attente », owner Finance, no CTA; its tab groups it under « En attente »', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(queue([unpaid(3, { payment: { ...mission().payment!, status: 'awaiting_proof' } })], { awaiting_payment: 1 }));
    renderPage('/mes-inspections?tab=awaiting_payment');
    await screen.findAllByRole('option');
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.queryByText('À traiter')).not.toBeInTheDocument();
    const article = pane();
    expect(within(article).getByText('Paiement en attente')).toBeInTheDocument();
    expect(within(article).getByText('Preuve de paiement attendue')).toBeInTheDocument();
    expect(within(article).getByText('Finance')).toBeInTheDocument();
    expect(within(article).queryByRole('button', { name: 'Enregistrer la tenue' })).not.toBeInTheDocument();
    expect(within(article).getByRole('link', { name: 'Ouvrir la mission' })).toBeInTheDocument();
  });

  it('an unpaid mission owned by the applicant names Postulant', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(queue([unpaid(3, { owner: OPERATIONAL_OWNERS.applicant })], { awaiting_payment: 1 }));
    renderPage('/mes-inspections?tab=awaiting_payment');
    await screen.findAllByRole('option');
    expect(within(pane()).getByText('Postulant')).toBeInTheDocument();
  });

  it('SU sees a mission assigned to another agent without any CTA; with their own assignment, the CTA appears', async () => {
    roles = ['SU', 'r3_agent'];
    vi.spyOn(api, 'get').mockResolvedValue(
      queue(
        [
          mission({ id: 'site_visit:1', phaseId: 1, requestReference: 'DEM-CI-01', assignedToViewer: false, assignedAgentName: 'Autre Agent' }),
          mission({ id: 'site_visit:2', phaseId: 2, requestReference: 'DEM-CI-02', assignedToViewer: true, siteVisit: { id: 12, r3AgentId: 6, scheduledAt: '2026-10-21T08:00:00.000Z', location: 'Hangar 4', status: 'scheduled' } }),
        ],
        { to_hold: 2 }
      )
    );
    renderPage('/mes-inspections?id=site_visit:1');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Inspections — Cellule Inspection');
    const other = await screen.findByRole('article', { name: /DEM-CI-01/ });
    expect(within(other).getByText('Agent CI : Autre Agent')).toBeInTheDocument();
    expect(within(other).queryByRole('button', { name: 'Enregistrer la tenue' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('option')[1]);
    const own = await screen.findByRole('article', { name: /DEM-CI-02/ });
    expect(within(own).getByRole('button', { name: 'Enregistrer la tenue' })).toBeInTheDocument();
  });

  it('a plain agent never sees the « Agent CI » line nor a visible « R3 »', async () => {
    renderPage();
    await screen.findAllByRole('option');
    expect(within(pane()).queryByText(/Agent CI :/)).not.toBeInTheDocument();
    expect(screen.queryByText(/R3/)).not.toBeInTheDocument();
  });

  it('verdict form only in « Avis à rendre » for the assigned agent; submit posts the verdict', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(queue([verdictDue(1), verdictDue(2, { assignedToViewer: false })], { verdict_due: 2 }));
    renderPage('/mes-inspections?tab=verdict_due');
    await screen.findAllByRole('option');
    // The textarea is `required`: submit the form directly to reach the zod message.
    fireEvent.submit(within(pane()).getByRole('button', { name: "Soumettre l'avis" }).closest('form') as HTMLFormElement);
    expect(await screen.findByText("La note est obligatoire pour soumettre l'avis d’inspection.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(within(pane()).getByLabelText('Note'), { target: { value: 'RAS' } });
    fireEvent.click(within(pane()).getByRole('button', { name: "Soumettre l'avis" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/site-inspection/phases/1/verdict', { verdict: 'compliant', note: 'RAS' }));
    fireEvent.click(screen.getAllByRole('option')[1]);
    const other = await screen.findByRole('article', { name: /DEM-CI-02/ });
    expect(within(other).queryByLabelText('Note')).not.toBeInTheDocument();
    expect(within(other).queryByRole('button', { name: "Soumettre l'avis" })).not.toBeInTheDocument();
  });

  it('no verdict form on « Visites à enregistrer »', async () => {
    renderPage();
    await screen.findAllByRole('option');
    expect(within(pane()).queryByLabelText('Note')).not.toBeInTheDocument();
  });

  it('the 7-day strip filters the list', async () => {
    const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const today = new Date().toISOString();
    vi.spyOn(api, 'get').mockResolvedValue(
      queue(
        [
          mission({ id: 'site_visit:1', phaseId: 1, requestReference: 'DEM-CI-01', siteVisit: { id: 11, r3AgentId: 5, scheduledAt: today, location: 'A', status: 'scheduled' } }),
          mission({ id: 'site_visit:2', phaseId: 2, requestReference: 'DEM-CI-02', siteVisit: { id: 12, r3AgentId: 5, scheduledAt: inTwoDays, location: 'B', status: 'scheduled' } }),
        ],
        { to_hold: 2 }
      )
    );
    renderPage();
    await screen.findAllByRole('option');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    const strip = screen.getByText('Prochaines inspections').closest('section') as HTMLElement;
    fireEvent.click(within(strip).getAllByRole('button')[2]);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('DEM-CI-02');
    fireEvent.click(within(strip).getByRole('button', { name: 'Voir toute la semaine' }));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
  });

  it('a visit due today shows « Échéance proche », a past one « En retard »', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(
      queue(
        [
          mission({ id: 'site_visit:1', phaseId: 1, requestReference: 'DEM-CI-01', urgency: 'warning', dueAt: new Date().toISOString() }),
          mission({ id: 'site_visit:2', phaseId: 2, requestReference: 'DEM-CI-02', urgency: 'overdue', dueAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }),
        ],
        { to_hold: 2 }
      )
    );
    renderPage();
    const rows = await screen.findAllByRole('option');
    expect(rows[0]).toHaveTextContent('DEM-CI-02');
    expect(within(rows[0]).getByText(/^En retard/)).toBeInTheDocument();
    expect(within(rows[1]).getByText('Échéance proche')).toBeInTheDocument();
  });

  it('« Tous » shows a closed-dossier mission with its badge and no CTA', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(
      queue([mission({ bucket: 'inactive', state: 'done', owner: null, actionKey: 'none', blockReason: 'dossier_closed', dossierClosed: true, dossierStatus: 'rejected' })], { inactive: 1 })
    );
    renderPage('/mes-inspections?tab=all');
    await screen.findAllByRole('option');
    expect(within(pane()).getByText('Dossier clos — consultation uniquement')).toBeInTheDocument();
    expect(screen.getAllByText('Dossier rejeté').length).toBeGreaterThan(0);
    expect(within(pane()).queryByRole('button', { name: 'Enregistrer la tenue' })).not.toBeInTheDocument();
  });

  it('a recording refused by the API shows its message and re-fetches the queue', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(queue([mission()], { to_hold: 1 }));
    vi.spyOn(api, 'patch').mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409, statusText: 'Conflict', headers: {}, config: { headers: new AxiosHeaders() },
        data: { code: 'SITE_VISIT_PAYMENT_NOT_VALIDATED', message: 'Le paiement n’est pas validé.' },
      })
    );
    renderPage();
    await screen.findAllByRole('option');
    const before = get.mock.calls.length;
    fireEvent.click(within(pane()).getByRole('button', { name: 'Enregistrer la tenue' }));
    expect(await screen.findByText('Le paiement n’est pas validé.')).toBeInTheDocument();
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
  });
});
