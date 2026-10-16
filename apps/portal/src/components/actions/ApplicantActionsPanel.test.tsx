import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import type { ApplicantAction } from '@aidn/shared';
import { renderWithProviders } from '../../test/render';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { api } from '../../lib/axios';
import { ApplicantActionsPanel } from './ApplicantActionsPanel';

const act = (over: Partial<ApplicantAction>): ApplicantAction => ({
  id: 'meeting_confirmation:4:12', key: 'meeting_confirmation', requestId: 4, requestReference: 'DEM-A', phaseCode: 'M3',
  priority: 10, urgent: false, anchor: 'rendez-vous-12', dueAt: '2026-11-03T09:00:00.000Z', ...over,
});
const seed = (list: ApplicantAction[]) => ({ seed: [[queryKeys.requests.actions(), list]] as Array<[readonly unknown[], unknown]> });

afterEach(() => vi.restoreAllMocks());

describe('<ApplicantActionsPanel>', () => {
  it('renders nothing without action', () => {
    renderWithProviders(<ApplicantActionsPanel />, seed([]));
    expect(screen.queryByRole('region', { name: 'Actions requises' })).not.toBeInTheDocument();
  });

  it('meeting confirmation: heading, wording, dossier, date and deep link', () => {
    renderWithProviders(<ApplicantActionsPanel />, seed([act({})]));
    const region = screen.getByRole('region', { name: 'Actions requises' });
    expect(within(region).getByRole('heading', { name: 'Actions requises (1)' })).toBeInTheDocument();
    expect(region).toHaveTextContent('Rendez-vous à confirmer');
    expect(region).toHaveTextContent('Dossier DEM-A');
    expect(region).toHaveTextContent(/Rendez-vous le /);
    expect(within(region).getByRole('link', { name: 'Répondre' })).toHaveAttribute('href', '/dossiers/4#rendez-vous-12');
  });

  it('keeps the seeded order, one link each, same key on two dossiers gives two rows', () => {
    const list = [
      act({ id: 'payment_proof:5:1', key: 'payment_proof', requestId: 5, requestReference: 'DEM-B', priority: 20, anchor: 'paiement-M5', dueAt: null }),
      act({ id: 'meeting_confirmation:4:12', requestId: 4 }),
      act({ id: 'meeting_confirmation:6:13', requestId: 6, requestReference: 'DEM-C', anchor: 'rendez-vous-13' }),
    ];
    renderWithProviders(<ApplicantActionsPanel />, seed(list));
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('DEM-B');
    expect(items[1]).toHaveTextContent('DEM-A');
    expect(items[2]).toHaveTextContent('DEM-C');
    expect(items.map((li) => within(li).getAllByRole('link')).every((l) => l.length === 1)).toBe(true);
  });

  it('payment after rejection and missing-document count wording', () => {
    renderWithProviders(
      <ApplicantActionsPanel />,
      seed([
        act({ id: 'p', key: 'payment_proof', variant: 'after_rejection', dueAt: null, anchor: 'paiement-M5' }),
        act({ id: 'f', key: 'formal_missing_documents', count: 3, dueAt: null, anchor: 'pieces-M4', requestId: 8, requestReference: 'DEM-D' }),
      ]),
    );
    expect(screen.getByText('Nouvelle quittance requise')).toBeInTheDocument();
    expect(screen.getByText(/\(3 manquante\(s\)\)/)).toBeInTheDocument();
  });

  it('signed meeting report: wording and deep link to its report panel', () => {
    renderWithProviders(
      <ApplicantActionsPanel />,
      seed([act({ id: 'signed_meeting_report:4:9', key: 'signed_meeting_report', phaseCode: 'M3', anchor: 'compte-rendu-9', dueAt: null })]),
    );
    expect(screen.getByText('Compte rendu à signer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir le dossier' })).toHaveAttribute('href', '/dossiers/4#compte-rendu-9');
  });

  it('urgent row carries data-urgent', () => {
    renderWithProviders(<ApplicantActionsPanel />, seed([act({ urgent: true })]));
    expect(screen.getByRole('listitem')).toHaveAttribute('data-urgent', 'true');
  });

  it('query error: alert with a retry button, inside the « Actions requises » region (spec §6.5)', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('boom'));
    const { queryClient } = renderWithProviders(<ApplicantActionsPanel />);
    await queryClient.resetQueries({ queryKey: queryKeys.requests.actions() });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger vos actions.');
    const region = screen.getByRole('region', { name: 'Actions requises' });
    expect(region).toContainElement(alert);
    expect(within(region).getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('after a mutation the refreshed list makes the region disappear', async () => {
    vi.spyOn(api, 'get').mockImplementation((url: string) =>
      url === '/applicant/actions' ? Promise.resolve({ data: [] }) : Promise.reject(new Error(`unexpected GET ${url}`)),
    );
    const { queryClient } = renderWithProviders(<ApplicantActionsPanel />, seed([act({})]));
    expect(screen.getByRole('region', { name: 'Actions requises' })).toBeInTheDocument();
    await queryClient.invalidateQueries({ queryKey: ['requests'] });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Actions requises' })).not.toBeInTheDocument());
  });
});
