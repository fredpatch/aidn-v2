/** ROLE-ANALYTICS-1F - the « Pilotage » entry is shown to every role that
 *  opens a role-analytics domain, and only to them; « Analytique » (global
 *  DN view) stays a separate entry. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let roles: string[] = [];
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { roles, fullName: 'Agent Test', employeeCode: 'E1' }, logout: vi.fn() }),
}));

const { default: AppShell } = await import('./AppShell');

function navLinks() {
  render(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>
  );
  return screen.getAllByRole('link').map((link) => link.getAttribute('href'));
}

describe('AppShell navigation: Pilotage', () => {
  it.each([['reception'], ['assistant_dg'], ['assistant_dn'], ['s5_agent'], ['r3_agent'], ['SU']])('%s sees Pilotage', (role) => {
    roles = [role];
    expect(navLinks()).toContain('/pilotage');
  });

  it.each([['dn_agent'], ['dn_supervisor']])('%s does not', (role) => {
    roles = [role];
    expect(navLinks()).not.toContain('/pilotage');
  });

  it('SU keeps both Pilotage and Analytique', () => {
    roles = ['SU'];
    const links = navLinks();
    expect(links).toContain('/pilotage');
    expect(links).toContain('/analytique');
  });
});
