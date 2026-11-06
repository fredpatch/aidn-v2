import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../../../test/render';
import { api } from '../../../../lib/axios';
import TeamProposalCard from './TeamProposalCard';

const auth = vi.hoisted(() => ({ roles: ['dn_supervisor'] }));
vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, roles: auth.roles } }),
}));
const members = [
  { id: 2, fullName: 'Alice DN', employeeCode: 'DN2' },
  { id: 3, fullName: 'Bob DN', employeeCode: 'DN3' },
];
const proposal = {
  id: 1,
  proposedApprovalNumber: 'PROP-1',
  proposedBy: 1,
  proposedAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-02T10:00:00Z',
  members: [members[0]],
};
let stored: { proposal: typeof proposal | null; team: null };
beforeEach(() => {
  vi.restoreAllMocks();
  auth.roles = ['dn_supervisor'];
  stored = { proposal: null, team: null };
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/requests/42/team') return { data: stored };
    if (url === '/dossier-teams/eligible-members') return { data: members };
    throw new Error(`Unexpected GET ${url}`);
  });
});

describe('Preliminary dossier team proposal card', () => {
  it('shows the empty proposal, neutral future-work help, and supervisor edit', async () => {
    renderWithProviders(<TeamProposalCard requestId="42" dossierClosed={false} />);
    expect(await screen.findByText('Aucune proposition d’équipe enregistrée.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier la proposition' })).toBeInTheDocument();
    expect(screen.getByText(/La proposition devra être validée/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Valider|Finaliser|Affecter/ })
    ).not.toBeInTheDocument();
  });
  it.each([['dn_agent'], ['reception']])('%s cannot edit', async (role) => {
    auth.roles = [role];
    stored = { proposal, team: null };
    renderWithProviders(<TeamProposalCard requestId="42" dossierClosed={false} />);
    expect(await screen.findByText('Alice DN')).toBeInTheDocument();
    expect(screen.getByText('PROP-1')).toBeInTheDocument();
    expect(screen.getByText('Numéro d’agrément proposé')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Modifier la proposition' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Équipe officielle|Approuvée|^Validée$/)).not.toBeInTheDocument();
  });
  it.each([['SU'], ['dn_agent', 'dn_supervisor']])(
    'allows editing for roles %j',
    async (...roles) => {
      auth.roles = roles;
      renderWithProviders(<TeamProposalCard requestId="42" dossierClosed={false} />);
      expect(
        await screen.findByRole('button', { name: 'Modifier la proposition' })
      ).toBeInTheDocument();
    }
  );
  it('closed dossier remains readable without editing', async () => {
    stored = { proposal, team: null };
    renderWithProviders(<TeamProposalCard requestId="42" dossierClosed />);
    expect(await screen.findByText('Alice DN')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Modifier la proposition' })
    ).not.toBeInTheDocument();
  });
  it('searches, selects multiple DN users, saves the proposal and refreshes the card', async () => {
    vi.spyOn(api, 'put').mockImplementation(async (_url, body) => {
      const input = body as { memberIds: number[]; proposedApprovalNumber: string };
      stored = {
        proposal: {
          ...proposal,
          proposedApprovalNumber: input.proposedApprovalNumber,
          members: members.filter((m) => input.memberIds.includes(m.id)),
        },
        team: null,
      };
      return { data: stored };
    });
    renderWithProviders(<TeamProposalCard requestId="42" dossierClosed={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier la proposition' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: /Alice DN/ }));
    fireEvent.change(within(dialog).getByLabelText('Rechercher un membre DN'), {
      target: { value: 'DN3' },
    });
    expect(within(dialog).queryByRole('checkbox', { name: /Alice DN/ })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Bob DN/ }));
    fireEvent.change(within(dialog).getByLabelText('Numéro d’agrément proposé'), {
      target: { value: 'PROP-NEW' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('PROP-NEW')).toBeInTheDocument();
    expect(screen.getByText('Alice DN')).toBeInTheDocument();
    expect(screen.getByText('Bob DN')).toBeInTheDocument();
    expect(api.put).toHaveBeenCalledWith('/requests/42/team-proposal', {
      memberIds: [2, 3],
      proposedApprovalNumber: 'PROP-NEW',
    });
  });
  it('displays server validation errors and keeps the form open', async () => {
    vi.spyOn(api, 'put').mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Membre devenu inactif.' } },
    });
    stored = { proposal, team: null };
    renderWithProviders(<TeamProposalCard requestId="42" dossierClosed={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier la proposition' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('checkbox', { name: /Alice DN/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Membre devenu inactif.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('keeps formerly eligible members visible for removal and Cancel does not save', async () => {
    stored = {
      proposal: { ...proposal, members: [{ id: 9, fullName: 'Ancien DN', employeeCode: 'DN9' }] },
      team: null,
    };
    const put = vi.spyOn(api, 'put');
    renderWithProviders(<TeamProposalCard requestId="42" dossierClosed={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier la proposition' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByRole('checkbox', { name: /Ancien DN.*non éligible/ })
    ).toBeChecked();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });
});
