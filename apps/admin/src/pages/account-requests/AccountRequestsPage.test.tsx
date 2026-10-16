/** SESSION1-ACCOUNT-1 - admin edit form for an approved applicant account. */
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

const account = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  organisationId: 10 + id,
  organisationName: `OMA ${id}`,
  fullName: `Jean ${id}`,
  email: `jean${id}@oma.test`,
  phone: '+22500000000',
  contactOrder: 'primary',
  active: true,
  createdAt: '2026-10-01T09:00:00.000Z',
  ...over,
});

let list = [account(1), account(2)];

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
  notifySuccess.mockClear();
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({
    data: url.includes('/applicants') ? list : [],
  }));
  vi.spyOn(api, 'patch').mockResolvedValue({ data: {} });
});
afterEach(() => vi.restoreAllMocks());

describe('<AccountRequestsPage> approved account edit', () => {
  it('shows the account information section with an enabled « Modifier »', async () => {
    const modifier = await openAccountsTab();
    expect(modifier).toBeEnabled();
    expect(screen.getByText('Informations du compte')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled();
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
