/** SESSION1-ACCOUNT-1 - admin edit form for an approved applicant account.
 *  ACCOUNT-V2 - rejected requests tab, password reset (DN supervisor / SU). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { api } from '../../lib/axios';
import { renderWithProviders } from '../../test/render';
import AccountRequestsPage from './AccountRequestsPage';

const notifySuccess = vi.fn();
vi.mock('../../lib/notify', () => ({
  notify: { success: (m: string) => notifySuccess(m), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

let roles: string[] = ['dn_agent'];
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles } }) }));

const account = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  organisationId: 10 + id,
  organisationName: `OMA ${id}`,
  fullName: `Jean ${id}`,
  email: `jean${id}@oma.test`,
  phone: '+22500000000',
  contactOrder: 'primary',
  active: true,
  mustChangePassword: false,
  createdAt: '2026-10-01T09:00:00.000Z',
  ...over,
});

let list = [account(1), account(2)];

const rejectedRequest = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  organisationNameInput: `Aéro Club ${id}`,
  legalAddress: 'Libreville',
  requestedEmail: `org${id}@club.test`,
  phone: null,
  originalApprovalNumber: null,
  contactFullName: `Paul ${id}`,
  contactEmail: `paul${id}@club.test`,
  contactPhone: null,
  status: 'rejected',
  rejectionReason: `Motif ${id}`,
  reviewedAt: '2026-09-15T10:00:00.000Z',
  submittedAt: '2026-09-10T08:00:00.000Z',
  candidates: [],
  ...over,
});
let rejectedList = [rejectedRequest(1), rejectedRequest(2)];

const conflict = () =>
  new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 409,
    statusText: 'Conflict',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { message: 'Un compte postulant existe déjà pour cet email.' },
  });

async function openAccountsTab() {
  renderWithProviders(<AccountRequestsPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Comptes approuvés/ }));
  return screen.findByRole('button', { name: 'Modifier' });
}

beforeEach(() => {
  list = [account(1), account(2)];
  rejectedList = [rejectedRequest(1), rejectedRequest(2)];
  roles = ['dn_agent'];
  notifySuccess.mockClear();
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({
    data: url.includes('/applicants') ? list : url.includes('status=rejected') ? rejectedList : [],
  }));
  vi.spyOn(api, 'patch').mockResolvedValue({ data: {} });
});
afterEach(() => vi.restoreAllMocks());

describe('<AccountRequestsPage> approved account edit', () => {
  it('shows the account information section with an enabled « Modifier »', async () => {
    const modifier = await openAccountsTab();
    expect(modifier).toBeEnabled();
    expect(screen.getByText('Informations du compte')).toBeInTheDocument();
    // ACCOUNT-V2 - dn_agent: no password reset (DN supervisor / SU only).
    expect(screen.queryByRole('button', { name: /Réinitialiser/ })).not.toBeInTheDocument();
  });

  it('shows « Non renseigné » when there is no phone', async () => {
    list = [account(1, { phone: null })];
    await openAccountsTab();
    expect(screen.getByText('Non renseigné')).toBeInTheDocument();
  });

  it('click « Modifier » prefills the form; organisation is read-only with the helper', async () => {
    fireEvent.click(await openAccountsTab());
    expect(screen.getByLabelText('Nom complet')).toHaveValue('Jean 1');
    expect(screen.getByLabelText('Email')).toHaveValue('jean1@oma.test');
    expect(screen.getByLabelText('Téléphone')).toHaveValue('+22500000000');
    expect(screen.getByLabelText('Ordre de contact')).toHaveValue('primary');
    expect(screen.queryByLabelText('Organisation')).not.toBeInTheDocument();
    expect(
      screen.getByText("L'organisme associé ne peut pas être modifié depuis cette fiche.")
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Suspendre le compte/ })).not.toBeInTheDocument();
    expect(screen.getByText('OMA 1', { selector: 'form p' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Utilisateur tertiaire' })).toBeInTheDocument();
  });

  it('cancel returns to view mode without calling patch', async () => {
    fireEvent.click(await openAccountsTab());
    fireEvent.change(screen.getByLabelText('Nom complet'), { target: { value: 'Autre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByLabelText('Nom complet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Suspendre le compte/ })).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('save patches the four fields, refetches, keeps the selection and notifies', async () => {
    const get = vi.mocked(api.get);
    fireEvent.click(await openAccountsTab());
    // select the second account first so we can prove the selection is kept
    fireEvent.click(screen.getAllByText('OMA 2')[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    fireEvent.change(screen.getByLabelText('Nom complet'), { target: { value: 'Marie Dupont' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'marie@oma.test' } });
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '  ' } });
    fireEvent.change(screen.getByLabelText('Ordre de contact'), { target: { value: 'secondary' } });
    list = [account(1), account(2, { fullName: 'Marie Dupont', email: 'marie@oma.test', phone: null, contactOrder: 'secondary' })];
    const callsBefore = get.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));

    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('Compte postulant mis à jour.'));
    expect(api.patch).toHaveBeenCalledWith('/account-requests/applicants/2', {
      fullName: 'Marie Dupont',
      email: 'marie@oma.test',
      phone: null,
      contactOrder: 'secondary',
    });
    expect(get.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(await screen.findByText('Marie Dupont', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nom complet')).not.toBeInTheDocument();
    expect(screen.getByText('Utilisateur secondaire', { selector: 'dd' })).toBeInTheDocument();
  });

  it('409 keeps the form, the typed email and shows the API message', async () => {
    vi.mocked(api.patch).mockRejectedValue(conflict());
    fireEvent.click(await openAccountsTab());
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'pris@oma.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Un compte postulant existe déjà pour cet email.'
    );
    expect(screen.getByLabelText('Email')).toHaveValue('pris@oma.test');
    expect(screen.getByRole('button', { name: 'Enregistrer les modifications' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeEnabled();
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it('changing the selected account leaves edit mode', async () => {
    fireEvent.click(await openAccountsTab());
    expect(screen.getByLabelText('Nom complet')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('OMA 2')[0]);
    await waitFor(() => expect(screen.queryByLabelText('Nom complet')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
  });

  it('suspend still calls /activation independently', async () => {
    await openAccountsTab();
    fireEvent.click(screen.getByRole('button', { name: 'Suspendre le compte' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/account-requests/applicants/1/activation', {
        active: false,
      })
    );
  });

  it('cancel then reopen shows no previous error', async () => {
    vi.mocked(api.patch).mockRejectedValue(conflict());
    fireEvent.click(await openAccountsTab());
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a late PATCH result for account A never touches account B panel', async () => {
    for (const outcome of ['reject', 'resolve'] as const) {
      cleanup();
      let settle!: () => void;
      vi.mocked(api.patch).mockImplementation(
        () =>
          new Promise((resolve, reject) => {
            settle = () => (outcome === 'reject' ? reject(conflict()) : resolve({ data: {} }));
          })
      );
      fireEvent.click(await openAccountsTab());
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
      fireEvent.click(screen.getAllByText('OMA 2')[0]);
      await waitFor(() => expect(screen.queryByLabelText('Nom complet')).not.toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
      await act(async () => {
        settle();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Nom complet')).toHaveValue('Jean 2');
      expect(screen.getByRole('button', { name: 'Enregistrer les modifications' })).toBeEnabled();
    }
  });

  it('reactivates a suspended account', async () => {
    list = [account(1, { active: false })];
    await openAccountsTab();
    fireEvent.click(screen.getByRole('button', { name: 'Réactiver le compte' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/account-requests/applicants/1/activation', {
        active: true,
      })
    );
  });
});

describe('<AccountRequestsPage> rejected requests (ACCOUNT-V2)', () => {
  async function openRejectedTab() {
    renderWithProviders(<AccountRequestsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Demandes rejetées/ }));
    return screen.findAllByText('Aéro Club 1');
  }

  it('three tabs; the rejected tab loads status=rejected with its count and metrics', async () => {
    await openRejectedTab();
    expect(screen.getByRole('button', { name: /Demandes en attente/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Comptes approuvés/ })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/account-requests?status=rejected');
    expect(screen.getByRole('button', { name: /Demandes rejetées/ })).toHaveTextContent('2');
    expect(screen.getByText('Rejetées ce mois')).toBeInTheDocument();
    expect(screen.getByText('Dernier rejet')).toBeInTheDocument();
    expect(screen.getByText('15/09/26')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2 demande(s) rejetée(s)' })).toBeInTheDocument();
  });

  it('the details panel is read-only: status, reason, decision date, no decision control', async () => {
    await openRejectedTab();
    fireEvent.click(screen.getAllByText('Aéro Club 2')[0]);
    const panel = (await screen.findByText('Motif du rejet')).closest('aside')!;
    await waitFor(() => expect(panel).toHaveTextContent('Motif 2'));
    expect(panel).toHaveTextContent('Date de décision');
    expect(panel).toHaveTextContent('Rejetée');
    expect(panel).toHaveTextContent('paul2@club.test');
    expect(screen.queryByRole('button', { name: /Approuver/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rejeter la demande/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Motif de rejet')).not.toBeInTheDocument();
  });

  it('search covers organisation, contact, emails and the rejection reason', async () => {
    rejectedList = [
      rejectedRequest(1, { rejectionReason: 'Documents falsifiés' }),
      rejectedRequest(2, { requestedEmail: 'direction@heli.test' }),
      rejectedRequest(3, { contactFullName: 'Zoé Martin' }),
    ];
    await openRejectedTab();
    const search = screen.getByPlaceholderText('Rechercher une demande...');
    const visible = () =>
      ['Aéro Club 1', 'Aéro Club 2', 'Aéro Club 3'].filter((name) => screen.queryAllByText(name).length > 0);
    for (const [needle, expected] of [
      ['falsifies', ['Aéro Club 1']],
      ['heli.test', ['Aéro Club 2']],
      ['zoe', ['Aéro Club 3']],
      ['paul1@club', ['Aéro Club 1']],
      ['club 2', ['Aéro Club 2']],
    ] as const) {
      fireEvent.change(search, { target: { value: needle } });
      await waitFor(() => expect(visible()).toEqual(expected));
    }
  });

  it('changing tab resets the search', async () => {
    await openRejectedTab();
    fireEvent.change(screen.getByPlaceholderText('Rechercher une demande...'), { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: /Comptes approuvés/ }));
    expect(await screen.findByPlaceholderText('Rechercher un compte...')).toHaveValue('');
  });
});

describe('<AccountRequestsPage> password reset (ACCOUNT-V2)', () => {
  const TEMP = 'Tmp9xKq2RstUvWy3';
  const resetButton = () => screen.findByRole('button', { name: 'Réinitialiser le mot de passe' });

  async function openReset() {
    renderWithProviders(<AccountRequestsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Comptes approuvés/ }));
    fireEvent.click(await resetButton());
    return screen.findByRole('dialog');
  }

  beforeEach(() => {
    roles = ['dn_supervisor'];
    vi.spyOn(api, 'post').mockResolvedValue({ data: { temporaryPassword: TEMP, account: account(1) } });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('visible for dn_supervisor and SU only', async () => {
    for (const [userRoles, visible] of [
      [['dn_supervisor'], true],
      [['SU'], true],
      [['dn_agent'], false],
      [['dn_agent', 'reception'], false],
    ] as const) {
      cleanup();
      roles = [...userRoles];
      renderWithProviders(<AccountRequestsPage />);
      fireEvent.click(await screen.findByRole('button', { name: /Comptes approuvés/ }));
      await screen.findByRole('button', { name: 'Modifier' });
      expect(!!screen.queryByRole('button', { name: 'Réinitialiser le mot de passe' })).toBe(visible);
    }
  });

  it('disabled on a suspended account', async () => {
    list = [account(1, { active: false })];
    renderWithProviders(<AccountRequestsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Comptes approuvés/ }));
    expect(await resetButton()).toBeDisabled();
  });

  it('asks for confirmation; « Annuler » closes it without any API call', async () => {
    const dialog = await openReset();
    expect(dialog).toHaveTextContent('Réinitialiser le mot de passe de ce postulant ?');
    expect(dialog).toHaveTextContent('Toutes ses sessions actives seront invalidées.');
    expect(dialog).toHaveTextContent(
      'Un mot de passe temporaire sera généré et devra être changé à la prochaine connexion.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('confirm: the temporary password is shown once, can be copied, and is gone after « Fermer »', async () => {
    await openReset();
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(await screen.findByTestId('temporary-password')).toHaveTextContent(TEMP);
    expect(api.post).toHaveBeenCalledWith('/account-requests/applicants/1/reset-password');
    expect(screen.getByRole('dialog')).toHaveTextContent('Il ne sera plus affiché après fermeture de cette fenêtre.');

    fireEvent.click(screen.getByRole('button', { name: 'Copier' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TEMP));
    expect(notifySuccess).toHaveBeenCalledWith('Mot de passe temporaire copié.');

    const getsBefore = vi.mocked(api.get).mock.calls.length;
    // The footer « Fermer » (the header ✕ shares its accessible name).
    fireEvent.click(screen.getAllByRole('button', { name: 'Fermer' }).find((button) => button.textContent === 'Fermer')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(TEMP)).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.get).mock.calls.slice(getsBefore).some(([url]) => String(url).includes('reset'))).toBe(false);
  });

  it('selecting another account drops a shown temporary password', async () => {
    await openReset();
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    await screen.findByTestId('temporary-password');
    fireEvent.click(screen.getAllByText('OMA 2')[0]);
    await waitFor(() => expect(screen.queryByText(TEMP)).not.toBeInTheDocument());
  });

  it('an API error shows the message and never a password', async () => {
    vi.mocked(api.post).mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { message: 'Ce compte est suspendu : réactivez-le avant de réinitialiser son mot de passe.' },
      })
    );
    await openReset();
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce compte est suspendu');
    expect(screen.queryByTestId('temporary-password')).not.toBeInTheDocument();
    expect(screen.queryByText('Mot de passe temporaire')).not.toBeInTheDocument();
  });

  it('an account waiting for its change says so', async () => {
    list = [account(1, { mustChangePassword: true })];
    renderWithProviders(<AccountRequestsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Comptes approuvés/ }));
    expect(await screen.findByText('Temporaire - à changer à la prochaine connexion')).toBeInTheDocument();
  });
});
