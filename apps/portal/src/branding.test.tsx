/** BRAND-AIDN-OMA-1 - the applicant portal names itself « AIDN - OMA » with
 *  the portal descriptor; one identity per screen (no overloaded block). */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./hooks/useApplicantAuth', () => ({
  useApplicantAuth: () => ({ refreshMe: vi.fn(), applicant: null }),
}));

const { default: LoginPage } = await import('./pages/auth/LoginPage');
const { AppHeader } = await import('./components/layout/AppHeader');

describe('portal branding', () => {
  it('login: « AIDN - OMA » and « Portail postulant OMA · ANAC Gabon », nothing longer', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1, name: 'AIDN - OMA' })).toBeInTheDocument();
    expect(screen.getByText('Portail postulant OMA · ANAC Gabon')).toBeInTheDocument();
    expect(screen.queryByText(/Organismes de Maintenance des Aéronefs/)).toBeNull();
    expect(screen.getAllByText('AIDN - OMA')).toHaveLength(1);
  });

  it('signed-in header: « AIDN - OMA » / « Portail postulant », accessible home link', () => {
    render(
      <MemoryRouter>
        <AppHeader fullName="Postulant Test" onLogout={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText('AIDN - OMA')).toBeInTheDocument();
    expect(screen.getByText('Portail postulant')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'AIDN - OMA - retour au tableau de bord' })).toHaveAttribute('href', '/');
  });
});
