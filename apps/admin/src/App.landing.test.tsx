/** SESSION1-M1-1 - landing and navigation by role, on the real <App>:
 *  an assistant_dn-only account goes straight to its inbox (no « Accès refusé »,
 *  no generic dashboard), and sees no other workspace in the sidebar. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { api } from './lib/axios';
import { renderWithProviders } from './test/render';

let mockRoles: string[] = [];
vi.mock('./hooks/useAuth', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({
    user: { id: 1, fullName: 'Assistante Test', roles: mockRoles },
    loading: false,
    bootstrapInitialised: true,
    refreshMe: async () => undefined,
    refreshBootstrapStatus: async () => undefined,
    logout: async () => undefined,
  }),
}));

import App from './App';

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url.includes('dn-annotation-tasks')) return { data: { items: [], counts: { toSend: 0, withDirector: 0, returned: 0 } } };
    if (url.includes('courrier-tasks')) return { data: { items: [], counts: { to_print: 0, with_dg: 0, returned: 0, inactive: 0 }, thresholds: { dgAlertWorkingDays: 3, depositDays: 1 } } };
    return { data: {} };
  });
});
afterEach(() => vi.restoreAllMocks());

function sidebarLabels(): string[] {
  const nav = screen.getByRole('navigation');
  return within(nav).getAllByRole('link').map((link) => link.textContent?.trim() ?? '');
}

describe('assistant_dn-only account', () => {
  it('lands on the Directeur DN circuit inbox from /', async () => {
    mockRoles = ['assistant_dn'];
    renderWithProviders(<App />, { route: '/' });
    expect(await screen.findByRole('heading', { name: 'Circuit Directeur DN' })).toBeInTheDocument();
    expect(screen.queryByText('Accès refusé')).not.toBeInTheDocument();
  });

  it('sees only « Circuit Directeur DN » in the sidebar', async () => {
    mockRoles = ['assistant_dn'];
    renderWithProviders(<App />, { route: '/' });
    await screen.findByRole('heading', { name: 'Circuit Directeur DN' });
    const labels = sidebarLabels();
    expect(labels.some((label) => label.includes('Circuit Directeur DN'))).toBe(true);
    for (const forbidden of ['Tableau de bord', 'Demandes', 'Comptes postulants', 'Courriers à traiter', 'Mes inspections', 'Paiements', 'Réunions', 'Analytique', 'Modèles', 'utilisateurs', 'Paramètres']) {
      expect(labels.some((label) => label.includes(forbidden)), forbidden).toBe(false);
    }
    expect(labels).toHaveLength(1);
  });

  it('is refused the other workspaces by URL (no widened access)', async () => {
    mockRoles = ['assistant_dn'];
    for (const route of ['/courriers', '/demandes', '/paiements-s5', '/mes-inspections']) {
      const { unmount } = renderWithProviders(<App />, { route });
      expect(await screen.findByText('Accès refusé'), route).toBeInTheDocument();
      unmount();
    }
  });
});

describe('account with no role at all', () => {
  it('gets « Accès refusé » (what a failed role assignment used to leave behind)', async () => {
    mockRoles = [];
    renderWithProviders(<App />, { route: '/' });
    expect(await screen.findByText('Accès refusé')).toBeInTheDocument();
  });
});

describe('other roles keep their landing and navigation', () => {
  it('reception does not see the Circuit Directeur DN entry and cannot open it', async () => {
    mockRoles = ['reception'];
    const { unmount } = renderWithProviders(<App />, { route: '/' });
    await waitFor(() => expect(sidebarLabels().length).toBeGreaterThan(0));
    expect(sidebarLabels().some((label) => label.includes('Circuit Directeur DN'))).toBe(false);
    unmount();
    renderWithProviders(<App />, { route: '/circuit-directeur-dn' });
    expect(await screen.findByText('Accès refusé')).toBeInTheDocument();
  });

  it('a multi-role user (assistant_dn + dn_agent) keeps the generic dashboard landing and sees the entry', async () => {
    mockRoles = ['assistant_dn', 'dn_agent'];
    renderWithProviders(<App />, { route: '/' });
    await waitFor(() => expect(sidebarLabels().length).toBeGreaterThan(1));
    expect(screen.queryByRole('heading', { name: 'Circuit Directeur DN' })).not.toBeInTheDocument();
    expect(sidebarLabels().some((label) => label.includes('Circuit Directeur DN'))).toBe(true);
  });

  it('SU sees the Circuit Directeur DN entry', async () => {
    mockRoles = ['SU'];
    renderWithProviders(<App />, { route: '/' });
    await waitFor(() => expect(sidebarLabels().length).toBeGreaterThan(1));
    expect(sidebarLabels().some((label) => label.includes('Circuit Directeur DN'))).toBe(true);
  });
});
