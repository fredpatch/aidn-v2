/** ACCOUNT-V2 - forced password change: a temporary password opens only the
 *  change screen; the change (current + new + confirmation) opens the portal. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const post = vi.fn();
const refreshMe = vi.fn();
const logout = vi.fn();
let applicant: Record<string, unknown> | null = null;

vi.mock('../../hooks/useApplicantAuth', () => ({
  ApplicantAuthProvider: ({ children }: { children: unknown }) => children,
  useApplicantAuth: () => ({ applicant, loading: false, refreshMe, logout }),
}));
vi.mock('../../lib/axios', () => ({
  api: { post: (...args: unknown[]) => post(...args) },
  apiErrorMessage: (error: { response?: { data?: { message?: string } } }, fallback: string) =>
    error?.response?.data?.message ?? fallback,
}));
vi.mock('../../lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../dashboard/DashboardPage', () => ({ default: () => <p>Tableau de bord postulant</p> }));

const { default: App } = await import('../../App');
const { default: ChangePasswordPage } = await import('./ChangePasswordPage');

const signedIn = (mustChangePassword: boolean) => ({
  id: 1,
  organisationId: 2,
  organisationName: 'OMA Test',
  fullName: 'Alice Postulant',
  email: 'alice@oma.test',
  contactOrder: 'primary',
  mustChangePassword,
});

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: {} });
  refreshMe.mockReset().mockResolvedValue(undefined);
  logout.mockReset();
});
afterEach(() => cleanup());

describe('portal gate with a temporary password', () => {
  const renderApp = (route = '/') =>
    render(
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    );

  it('signed in with a temporary password: only the change screen, on any URL', () => {
    applicant = signedIn(true);
    for (const route of ['/', '/dossiers', '/compte']) {
      cleanup();
      renderApp(route);
      expect(screen.getByText('Votre mot de passe doit être modifié avant de continuer.')).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).not.toBeInTheDocument();
      expect(screen.queryByText('Tableau de bord postulant')).not.toBeInTheDocument();
    }
  });

  it('without a pending change: the normal portal', () => {
    applicant = signedIn(false);
    renderApp();
    expect(screen.getAllByRole('navigation', { name: 'Navigation principale' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Tableau de bord postulant')).toBeInTheDocument();
    expect(screen.queryByText('Votre mot de passe doit être modifié avant de continuer.')).not.toBeInTheDocument();
  });

  it('« Se déconnecter » is available from the change screen', async () => {
    applicant = signedIn(true);
    renderApp();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(logout).toHaveBeenCalled();
  });
});

describe('<ChangePasswordPage>', () => {
  const renderPage = () =>
    render(<ChangePasswordPage fullName="Alice Postulant" onChanged={refreshMe} onLogout={logout} />);
  async function fill(current: string, next: string, confirmation: string) {
    const user = userEvent.setup();
    if (current) await user.type(screen.getByLabelText('Mot de passe temporaire / actuel'), current);
    if (next) await user.type(screen.getByLabelText('Nouveau mot de passe'), next);
    if (confirmation) await user.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), confirmation);
    await user.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }));
  }

  it('validation errors, no API call', async () => {
    for (const [current, next, confirmation, message] of [
      ['', 'Nouveau-2026', 'Nouveau-2026', 'Saisissez votre mot de passe temporaire ou actuel.'],
      ['Tmp9xKq2RstUvWy3', 'court', 'court', 'Le nouveau mot de passe doit contenir au moins 8 caractères.'],
      ['Tmp9xKq2RstUvWy3', 'Nouveau-2026', 'Autre-2026', 'La confirmation ne correspond pas au nouveau mot de passe.'],
      ['Tmp9xKq2RstUvWy3', 'Tmp9xKq2RstUvWy3', 'Tmp9xKq2RstUvWy3', "Le nouveau mot de passe doit être différent de l'actuel."],
    ]) {
      cleanup();
      renderPage();
      await fill(current, next, confirmation);
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
    }
    expect(post).not.toHaveBeenCalled();
  });

  it('an API refusal shows its message and keeps the screen', async () => {
    post.mockRejectedValue({ response: { data: { message: 'Le mot de passe actuel est incorrect.' } } });
    renderPage();
    await fill('mauvais-mdp', 'Nouveau-2026', 'Nouveau-2026');
    expect(await screen.findByRole('alert')).toHaveTextContent('Le mot de passe actuel est incorrect.');
    expect(refreshMe).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Modifier le mot de passe' })).toBeEnabled();
  });

  it('a valid change posts current + new password, then reloads the applicant (portal opens)', async () => {
    renderPage();
    await fill('Tmp9xKq2RstUvWy3', 'Nouveau-2026', 'Nouveau-2026');
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/applicant-auth/change-password', {
        currentPassword: 'Tmp9xKq2RstUvWy3',
        newPassword: 'Nouveau-2026',
      })
    );
    await waitFor(() => expect(refreshMe).toHaveBeenCalledTimes(1));
  });
});
