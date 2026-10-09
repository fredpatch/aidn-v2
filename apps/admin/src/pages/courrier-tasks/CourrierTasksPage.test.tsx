/** C2b - Courriers à traiter, two panes: circuit tabs (K7d), ?id= selection,
 *  keyboard, and Entrée never changing the circuit. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { api } from '../../lib/axios';
import type { CourrierTask } from '../../lib/api/courrier-tasks';
import { renderWithProviders } from '../../test/render';
import CourrierTasksPage from './CourrierTasksPage';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles: ['reception'] } }) }));

const task = (n: number, over: Partial<CourrierTask> = {}): CourrierTask => ({
  id: `formal_request_letter:${n}`,
  source: 'formal_request_letter',
  bucket: 'to_signature',
  requestId: n,
  requestReference: `DEM-C2-0${n}`,
  requestType: 'issuance',
  organisationName: `OMA ${n}`,
  applicantName: 'Jean Test',
  circuitDocumentId: n,
  circuitStatus: 'submitted',
  fileUrl: `/api/files/lettre-${n}.pdf`,
  mimeType: 'application/pdf',
  depositedAt: `2026-10-0${n}T09:00:00.000Z`,
  signatureSentAt: null,
  signedAt: null,
  pendingReviewAt: null,
  availableActions: ['print', 'confirm_signature_circuit'],
  dossierStatus: 'in_progress',
  dossierClosed: false,
  actionBlockedReason: null,
  signatureWorkingDays: null,
  signatureLate: false,
  ...over,
});

const ITEMS: CourrierTask[] = [
  task(1),
  task(2),
  task(3, {
    bucket: 'in_signature',
    circuitStatus: 'in_signature_circuit',
    signatureSentAt: '2026-10-04T09:00:00.000Z',
    availableActions: ['upload_signed_return'],
  }),
  task(4, {
    bucket: 'legacy_signed',
    circuitStatus: 'signed',
    signedAt: '2026-06-12T09:00:00.000Z',
    availableActions: [],
  }),
];

beforeEach(() => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { items: ITEMS, counts: {} } });
  vi.spyOn(api, 'post').mockResolvedValue({ data: null });
});
afterEach(() => vi.restoreAllMocks());

const pane = () => screen.getByRole('article');
const tab = (name: RegExp) => screen.getByRole('button', { name });

describe('<CourrierTasksPage> two panes (C2b)', () => {
  it('opens on « À imprimer », oldest first; « Ancien signé » has no tab, only « Tous »', async () => {
    renderWithProviders(<CourrierTasksPage />);
    const rows = await screen.findAllByRole('option');
    expect(rows).toHaveLength(2);
    expect(within(pane()).getByRole('heading', { name: 'DEM-C2-01' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ancien signé/ })).not.toBeInTheDocument();
    fireEvent.click(tab(/^Tous/));
    expect(await screen.findAllByRole('option')).toHaveLength(4);
  });

  it('?id= selects the courrier; an id outside the view falls back to the first row', async () => {
    renderWithProviders(<CourrierTasksPage />, { route: '/courriers?id=formal_request_letter:2' });
    expect(
      await within(await screen.findByRole('article')).findByRole('heading', { name: 'DEM-C2-02' })
    ).toBeInTheDocument();
  });

  it('↑/↓ move the selection; Entrée only focuses « Ouvrir / imprimer » (no circuit change)', async () => {
    renderWithProviders(<CourrierTasksPage />);
    const first = (await screen.findAllByRole('option'))[0];
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    const second = screen.getAllByRole('option')[1];
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(within(pane()).getByRole('heading', { name: 'DEM-C2-02' })).toBeInTheDocument();

    fireEvent.keyDown(second, { key: 'Enter' });
    expect(screen.getByRole('button', { name: /Ouvrir \/ imprimer/ })).toHaveFocus();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('in signature: Entrée only focuses « Scanner le retour signé »; the modal is not opened', async () => {
    renderWithProviders(<CourrierTasksPage />);
    await screen.findAllByRole('option');
    fireEvent.click(tab(/^En signature/));
    const row = (await screen.findAllByRole('option'))[0];
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByRole('button', { name: /Scanner le retour signé/ })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /Enregistrer le retour/ })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('/ focuses the search box', async () => {
    renderWithProviders(<CourrierTasksPage />);
    const row = (await screen.findAllByRole('option'))[0];
    fireEvent.keyDown(row, { key: '/' });
    expect(screen.getByRole('searchbox', { name: 'Rechercher un courrier' })).toHaveFocus();
  });

  it('phase not open (C2c/C2d): only under « Tous », no action button, the reason is shown', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        items: [task(1, { availableActions: [], actionBlockedReason: 'phase_not_open' })],
        counts: {},
        signatureAlertDays: 3,
      },
    });
    renderWithProviders(<CourrierTasksPage />);
    // C2d - out of « À imprimer » (empty), listed under « Tous »
    expect(await screen.findByText('Aucun courrier dans cette vue')).toBeInTheDocument();
    fireEvent.click(tab(/^Tous/));
    await screen.findAllByRole('option');
    expect(screen.queryByRole('button', { name: /Ouvrir \/ imprimer/ })).not.toBeInTheDocument();
    expect(
      within(pane()).getByText(/phase M4 de ce dossier n'est pas ouverte/)
    ).toBeInTheDocument();
  });
});
