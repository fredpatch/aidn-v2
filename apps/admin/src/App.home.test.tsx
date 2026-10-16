import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

let roles: string[] = [];
vi.mock('./hooks/useAuth', () => ({ useAuth: () => ({ user: { roles } }) }));
vi.mock('./pages/dashboard/DashboardPage', () => ({ default: () => <p>DN dashboard</p> }));

const { HomeRoute } = await import('./App');

function renderHome() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/paiements-s5" element={<p>Finance queue</p>} />
        <Route path="/mes-inspections" element={<p>CI queue</p>} />
        <Route path="/courriers" element={<p>Courriers queue</p>} />
        <Route path="/circuit-directeur-dn" element={<p>DN circuit queue</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HomeRoute', () => {
  it.each([
    [['dn_agent'], 'DN dashboard'],
    [['SU'], 'DN dashboard'],
    [['s5_agent'], 'Finance queue'],
    [['r3_agent'], 'CI queue'],
    [['assistant_dg'], 'Courriers queue'],
    [['assistant_dn'], 'DN circuit queue'],
  ])('%j lands on %s', (r, expected) => {
    roles = r;
    renderHome();
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('no operational role: access denied', () => {
    roles = [];
    renderHome();
    expect(screen.getByText('Accès refusé')).toBeInTheDocument();
  });
});
