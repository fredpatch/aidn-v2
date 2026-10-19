/** BRAND-AIDN-OMA-1 - the admin names itself « AIDN - OMA » (sidebar, top
 *  bar, login, bootstrap, browser tab) with the institutional line; the old
 *  long names and the em dash are gone from visible admin / portal source. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ADMIN_DOCUMENT_TITLE, PORTAL_DOCUMENT_TITLE } from '@aidn/shared';

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    user: { roles: ['SU'], fullName: 'Agent Test', employeeCode: 'E1' },
    logout: vi.fn(),
    refreshMe: vi.fn(),
    refreshBootstrapStatus: vi.fn(),
  }),
}));

const { default: AppShell } = await import('./components/layouts/AppShell');
const { default: LoginPage } = await import('./pages/auth/LoginPage');
const { default: BootstrapPage } = await import('./pages/auth/BootstrapPage');

const here = path.dirname(fileURLToPath(import.meta.url));
const appsRoot = path.resolve(here, '../..');
const SUBTITLE = 'Service OMA · Direction de la Navigabilité · ANAC Gabon';

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('admin branding', () => {
  it('sidebar and top bar: « AIDN - OMA », the service line, no long legacy sentence', () => {
    inRouter(<AppShell />);
    expect(screen.getAllByText('AIDN - OMA')).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 1, name: 'AIDN - OMA' })).toBeInTheDocument();
    expect(screen.getByText('Service OMA · Direction de la Navigabilité')).toBeInTheDocument();
    expect(screen.getByText('ANAC Gabon')).toBeInTheDocument();
    expect(screen.queryByText(/Application Informatique/)).toBeNull();
  });

  it('login: product name and the full institutional line', () => {
    inRouter(<LoginPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'AIDN - OMA' })).toBeInTheDocument();
    expect(screen.getByText(SUBTITLE)).toBeInTheDocument();
  });

  it('bootstrap: product name, institutional line, « Initialisation d’AIDN - OMA »', () => {
    inRouter(<BootstrapPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'AIDN - OMA' })).toBeInTheDocument();
    expect(screen.getByText(SUBTITLE)).toBeInTheDocument();
    expect(screen.getByText("Initialisation d'AIDN - OMA")).toBeInTheDocument();
  });

  it('browser tab titles: admin and portal differ, both from the shared constants', () => {
    const title = (app: string) => fs.readFileSync(path.join(appsRoot, app, 'index.html'), 'utf8').match(/<title>(.*)<\/title>/)?.[1];
    expect(title('admin')).toBe(ADMIN_DOCUMENT_TITLE);
    expect(title('portal')).toBe(PORTAL_DOCUMENT_TITLE);
    expect(ADMIN_DOCUMENT_TITLE).toBe('AIDN - OMA | Administration');
    expect(PORTAL_DOCUMENT_TITLE).toBe('AIDN - OMA | Portail postulant');
  });

  it('visible admin / portal source: no bare « AIDN » brand, no legacy long name, no em dash', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf8');
          if (/>AIDN<|Application Informatique|Service des OMA|Portail Postulant -|—/.test(text)) offenders.push(path.relative(appsRoot, full));
        }
      }
    };
    walk(path.join(appsRoot, 'admin', 'src'));
    walk(path.join(appsRoot, 'portal', 'src'));
    expect(offenders).toEqual([]);
  });
});
