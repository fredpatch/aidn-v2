/** SESSION1-COCKPIT-1 - Courriers cockpit: role landing tab, callout owner and
 *  CTA by role, « Tous » with inactive rows, Entrée never acting, waiting
 *  grouping, DOSSIER_CLOSED reload. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { OPERATIONAL_OWNERS } from '@aidn/shared';
import { api } from '../../lib/axios';
import type { CourrierTask } from '../../lib/api/courrier-tasks';
import { renderWithProviders } from '../../test/render';
import CourrierTasksPage from './CourrierTasksPage';
import { courrier } from '../../test/courrierFixtures';

let roles = ['reception'];
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles } }) }));

const thresholds = { dgAlertWorkingDays: 3, depositDays: 1 };
const task = (n: number, over: Partial<CourrierTask> = {}): CourrierTask =>
  courrier({
    id: `formal_request_letter:${n}`, requestId: n, requestReference: `DEM-C2-0${n}`, organisationName: `OMA ${n}`,
    circuitDocumentId: n, fileUrl: `/api/files/lettre-${n}.pdf`, stepSince: `2026-10-0${n}T09:00:00.000Z`,
    depositedAt: `2026-10-0${n}T09:00:00.000Z`, ...over,
  });
const withDg = (n: number, over: Partial<CourrierTask> = {}) =>
  task(n, {
    bucket: 'with_dg', actionKey: 'record_dg_annotation', circuitStep: 'with_dg', circuitStatus: 'in_signature_circuit',
    signatureSentAt: '2026-10-04T09:00:00.000Z', availableActions: ['upload_signed_return'], owner: OPERATIONAL_OWNERS.assistantDg,
    signatureWorkingDays: 1, ...over,
  });
const inactive = (n: number) =>
  task(n, {
    bucket: 'inactive', state: 'done', owner: null, actionKey: 'none', blockReason: 'dossier_closed', dossierClosed: true,
    dossierStatus: 'rejected', availableActions: [],
  });

const ITEMS: CourrierTask[] = [task(1), task(2), withDg(3), inactive(4)];
const COUNTS = { to_print: 2, with_dg: 1, returned: 0, inactive: 1 };
const seed = (items: CourrierTask[], counts = COUNTS) => ({ data: { items, counts, thresholds } });

const renderPage = (route = '/courriers') => renderWithProviders(<CourrierTasksPage />, { route });
const pane = () => screen.getByRole('article');
const tabBtn = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  roles = ['reception'];
  vi.spyOn(api, 'get').mockResolvedValue(seed(ITEMS));
  vi.spyOn(api, 'post').mockResolvedValue({ data: null });
});
afterEach(() => vi.restoreAllMocks());

describe('<CourrierTasksPage> cockpit', () => {
  it('Réception lands on « À imprimer »; Assistant DG alone on « Retour DG attendu »', async () => {
    roles = ['reception'];
    renderPage();
    await screen.findAllByRole('option');
    expect(tabBtn(/^À imprimer/)).toHaveClass('border-anac-blue');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    cleanup();
    roles = ['assistant_dg'];
    renderPage();
    await screen.findAllByRole('option');
    expect(tabBtn(/^Retour DG attendu/)).toHaveClass('border-anac-blue');
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('callout: owner named, CTA « Ouvrir / imprimer » for Réception', async () => {
    renderPage();
    const article = await screen.findByRole('article', { name: /Détail du courrier DEM-C2-01/ });
    expect(within(article).getByText('Responsable :')).toBeInTheDocument();
    expect(within(article).getByRole('button', { name: /Ouvrir \/ imprimer/ })).toBeInTheDocument();
    expect(within(article).getByRole('button', { name: /Voir le document/ })).toBeInTheDocument();
  });

  it('a role that cannot act gets no CTA but keeps the secondary links', async () => {
    roles = ['dn_agent'];
    renderPage();
    const article = await screen.findByRole('article', { name: /Détail du courrier/ });
    expect(within(article).queryByRole('button', { name: /Ouvrir \/ imprimer/ })).not.toBeInTheDocument();
    expect(within(article).getByRole('button', { name: /Voir le document/ })).toBeInTheDocument();
    expect(within(article).getByRole('link', { name: /Voir le dossier/ })).toBeInTheDocument();
  });

  it('« Tous » shows an inactive (closed) courrier with its badge and no CTA; action tabs never count it', async () => {
    renderPage();
    await screen.findAllByRole('option');
    expect(tabBtn(/^À imprimer/)).toHaveTextContent('2');
    expect(tabBtn(/^Retour DG attendu/)).toHaveTextContent('1');
    fireEvent.click(tabBtn(/^Tous/));
    expect(await screen.findAllByRole('option')).toHaveLength(4);
    const last = screen.getByRole('article', { name: /DEM-C2-04/ });
    expect(within(last).getAllByText('Dossier rejeté').length).toBeGreaterThan(0);
    expect(within(last).queryByRole('button', { name: /Ouvrir \/ imprimer/ })).not.toBeInTheDocument();
    expect(within(last).getByText('Dossier clos — consultation uniquement')).toBeInTheDocument();
  });

  it('Entrée on a row focuses the action button, never prints', async () => {
    renderPage();
    const first = (await screen.findAllByRole('option'))[0];
    first.focus();
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(within(pane()).getByRole('button', { name: /Ouvrir \/ imprimer/ })).toHaveFocus();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('« Retour DG attendu » groups a normal item under « En attente », never « À traiter »', async () => {
    renderPage('/courriers?tab=with_dg');
    await screen.findAllByRole('option');
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.queryByText('À traiter')).not.toBeInTheDocument();
  });

  it('DOSSIER_CLOSED during « Impression OK »: the list reloads and the API message is shown', async () => {
    const get = vi.spyOn(api, 'get');
    get.mockResolvedValueOnce(seed([task(1)], { to_print: 1, with_dg: 0, returned: 0, inactive: 0 }));
    get.mockResolvedValue(seed([inactive(1)], { to_print: 0, with_dg: 0, returned: 0, inactive: 1 }));
    vi.spyOn(api, 'post').mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409, statusText: 'Conflict', headers: {}, config: { headers: new AxiosHeaders() },
        data: { code: 'DOSSIER_CLOSED', message: 'Le dossier est clos.' },
      })
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir \/ imprimer/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Impression OK/ }));
    expect(await screen.findByText('Le dossier est clos.')).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Impression OK/ })).not.toBeInTheDocument());
  });
});
