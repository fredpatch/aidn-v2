/** ROLE-ANALYTICS-1F - /pilotage: domains and scopes from the shared access
 *  matrix, API values shown as returned (labels, units, caveats, warnings,
 *  activity), and every filter change refetching. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import type { RoleAnalyticsOverview } from '@aidn/shared';
import { api } from '../../lib/axios';
import { renderWithProviders } from '../../test/render';
import { PILOTAGE_ROLES, pilotageDomains, pilotageScopes } from './pilotage.access';

let roles: string[] = [];
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles, fullName: 'Agent Test' } }) }));

const { default: PilotagePage } = await import('./PilotagePage');

const PERIOD = {
  preset: 'this_month' as const,
  start: '2026-09-30T23:00:00.000Z',
  end: '2026-10-31T23:00:00.000Z',
  timeZone: 'Africa/Libreville' as const,
  displayFrom: '2026-10-01',
  displayTo: '2026-10-31',
};

function overview(partial: Partial<RoleAnalyticsOverview> = {}): RoleAnalyticsOverview {
  return {
    domain: 'courrier',
    scope: 'service',
    period: PERIOD,
    generatedAt: '2026-10-19T09:00:00.000Z',
    metrics: [],
    warnings: [],
    recentActivity: [],
    ...partial,
  };
}

const RICH = overview({
  metrics: [
    { key: 'courrier.sent_to_dg', value: 5, unit: 'count', basis: 'period', reliability: 'reliable', previousValue: 2 },
    { key: 'courrier.dg_return_recorded', value: 4, unit: 'count', basis: 'period', reliability: 'reliable', previousValue: 4 },
    { key: 'courrier.average_dg_circuit_duration', value: 6.8, unit: 'calendar_days', basis: 'period', sampleSize: 5, reliability: 'reliable' },
    { key: 'finance.invoice_uploaded', value: 3, unit: 'count', basis: 'period', reliability: 'caveat', caveatKey: 'legacy_db_timezone', previousValue: 7 },
    { key: 'courrier.to_print_backlog', value: 2, unit: 'count', basis: 'current', reliability: 'reliable' },
  ],
  warnings: [
    {
      key: 'courrier.dg_return_overdue',
      severity: 'danger',
      count: 3,
      oldest: { requestId: 12, requestReference: 'DEM-2026-0012', since: '2026-09-02T10:00:00.000Z', itemId: 'intake_request:12' },
      href: '/courriers?tab=with_dg&id=intake_request:12',
    },
  ],
  recentActivity: [
    { at: '2026-10-18T09:30:00.000Z', eventKey: 'courrier.sent_to_dg', actor: { kind: 'staff', userId: 4, fullName: 'Awa Mba' }, requestId: 12, requestReference: 'DEM-2026-0012', href: '/courriers?tab=all&id=intake_request:12' },
    { at: '2026-10-17T09:30:00.000Z', eventKey: 'finance.proof_uploaded', actor: { kind: 'applicant' }, requestId: 13, requestReference: 'DEM-2026-0013', href: null },
    { at: '2026-10-16T09:30:00.000Z', eventKey: 'courrier.dg_return_recorded', actor: null, requestId: 14, requestReference: 'DEM-2026-0014', href: null },
  ],
});

function mockApi(data: RoleAnalyticsOverview = RICH) {
  return vi.spyOn(api, 'get').mockResolvedValue({ data });
}

const lastCall = (get: ReturnType<typeof mockApi>) => {
  const [url, config] = get.mock.calls[get.mock.calls.length - 1] as [string, { params: Record<string, string | undefined> }];
  return { url, params: config.params };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pilotage access (shared matrix)', () => {
  it.each([
    [['reception'], ['courrier']],
    [['assistant_dg'], ['courrier']],
    [['assistant_dn'], ['dn_circuit']],
    [['s5_agent'], ['finance']],
    [['r3_agent'], ['inspection']],
    [['SU'], ['courrier', 'dn_circuit', 'finance', 'inspection']],
    [['dn_supervisor'], []],
    [['dn_agent'], []],
    [['dn_supervisor', 's5_agent'], ['finance']],
  ])('%j opens %j', (r, expected) => {
    expect(pilotageDomains(r)).toEqual(expected);
  });

  it('r3_agent: mine only; SU: both scopes everywhere; the route excludes DN-only roles', () => {
    expect(pilotageScopes(['r3_agent'], 'inspection')).toEqual(['mine']);
    for (const domain of pilotageDomains(['SU'])) expect(pilotageScopes(['SU'], domain)).toEqual(['mine', 'service']);
    expect(PILOTAGE_ROLES).not.toContain('dn_supervisor');
    expect(PILOTAGE_ROLES).not.toContain('dn_agent');
    expect([...PILOTAGE_ROLES].sort()).toEqual(['SU', 'assistant_dg', 'assistant_dn', 'r3_agent', 'reception', 's5_agent']);
  });
});

describe('<PilotagePage> domain and scope', () => {
  it('reception: Courrier only (no domain selector), both scopes, mine first', async () => {
    roles = ['reception'];
    const get = mockApi();
    renderWithProviders(<PilotagePage />);
    await screen.findByText('Mis en circuit DG');
    expect(screen.queryByRole('group', { name: 'Domaine' })).toBeNull();
    expect(screen.getByText('Courrier')).toBeInTheDocument();
    const scope = screen.getByRole('group', { name: 'Périmètre' });
    expect(within(scope).getByRole('button', { name: 'Mon activité' })).toHaveAttribute('aria-pressed', 'true');
    expect(lastCall(get)).toEqual({ url: '/analytics/roles/courrier', params: { scope: 'mine', period: 'this_month', from: undefined, to: undefined } });
  });

  it('r3_agent: Cellule Inspection, mine only, never a service option', async () => {
    roles = ['r3_agent'];
    const get = mockApi(overview({ domain: 'inspection', scope: 'mine' }));
    renderWithProviders(<PilotagePage />);
    await screen.findByText('Aucun point d’attention actuellement.');
    expect(screen.getByText('Cellule Inspection')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Périmètre' })).toBeNull();
    expect(screen.queryByText('Activité du service')).toBeNull();
    expect(lastCall(get).params.scope).toBe('mine');
    expect(get.mock.calls.every(([, config]) => (config as { params: { scope: string } }).params.scope === 'mine')).toBe(true);
  });

  it('SU: the four domains and both scopes; switching domain and scope refetches; global analytics link', async () => {
    roles = ['SU'];
    const get = mockApi();
    renderWithProviders(<PilotagePage />);
    await screen.findByText('Mis en circuit DG');
    const domains = screen.getByRole('group', { name: 'Domaine' });
    expect(within(domains).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Courrier',
      'Circuit Directeur DN',
      'Finance',
      'Cellule Inspection',
    ]);
    expect(screen.getByRole('link', { name: /Voir l’analyse globale/ })).toHaveAttribute('href', '/analytique');

    fireEvent.click(within(domains).getByRole('button', { name: 'Finance' }));
    await waitFor(() => expect(lastCall(get).url).toBe('/analytics/roles/finance'));
    fireEvent.click(within(screen.getByRole('group', { name: 'Périmètre' })).getByRole('button', { name: 'Activité du service' }));
    await waitFor(() => expect(lastCall(get).params.scope).toBe('service'));
    expect(lastCall(get).url).toBe('/analytics/roles/finance');
  });

  it('a role without any domain (dn_supervisor) gets no dashboard and no request', () => {
    roles = ['dn_supervisor'];
    const get = mockApi();
    renderWithProviders(<PilotagePage />);
    expect(screen.getByText('Pilotage indisponible')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
});

describe('<PilotagePage> period', () => {
  it('a preset refetches with the preset; custom waits for both dates and sends them as YYYY-MM-DD', async () => {
    roles = ['s5_agent'];
    const get = mockApi();
    renderWithProviders(<PilotagePage />);
    await screen.findByText('Mis en circuit DG');
    fireEvent.change(screen.getByLabelText('Période'), { target: { value: 'last_7_days' } });
    await waitFor(() => expect(lastCall(get).params.period).toBe('last_7_days'));

    const calls = get.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Période'), { target: { value: 'custom' } });
    expect(screen.getByText(/Choisissez une date de début/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Appliquer' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Date de début'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Date de fin'), { target: { value: '2026-09-15' } });
    expect(get.mock.calls.length).toBe(calls);
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    await waitFor(() =>
      expect(lastCall(get)).toEqual({
        url: '/analytics/roles/finance',
        params: { scope: 'mine', period: 'custom', from: '2026-09-01', to: '2026-09-15' },
      })
    );
  });

  it('shows the period resolved by the API', async () => {
    roles = ['reception'];
    mockApi();
    renderWithProviders(<PilotagePage />);
    expect(await screen.findByText('Du 01/10/2026 au 31/10/2026')).toBeInTheDocument();
  });
});

describe('<PilotagePage> rendering', () => {
  it('metric cards: French labels, units, sample size, previous period (neutral), caveat; period vs current', async () => {
    roles = ['SU'];
    mockApi();
    renderWithProviders(<PilotagePage />);
    const period = await screen.findByRole('region', { name: 'Sur la période' });
    const sent = within(period).getByText('Mis en circuit DG').closest('li')!;
    expect(within(sent).getByText('5')).toBeInTheDocument();
    expect(within(sent).getByText('+3 vs période précédente')).toBeInTheDocument();
    expect(within(within(period).getByText('Retours DG enregistrés').closest('li')!).getByText('Stable vs période précédente')).toBeInTheDocument();
    const duration = within(period).getByText('Durée moyenne du circuit DG').closest('li')!;
    expect(within(duration).getByText('6,8 j')).toBeInTheDocument();
    expect(within(duration).getByText('Basé sur 5 dossiers')).toBeInTheDocument();
    const invoices = within(period).getByText('Factures transmises').closest('li')!;
    expect(within(invoices).getByText('−4 vs période précédente')).toBeInTheDocument();
    expect(within(invoices).getByText('Certaines anciennes données peuvent présenter un léger décalage horaire.')).toBeInTheDocument();
    const current = screen.getByRole('region', { name: 'Situation actuelle' });
    expect(within(current).getByText('À imprimer')).toBeInTheDocument();
    expect(screen.queryByText(/courrier\./)).toBeNull();
  });

  it('warnings use the API count, oldest item and link', async () => {
    roles = ['reception'];
    mockApi();
    renderWithProviders(<PilotagePage />);
    const warnings = await screen.findByRole('region', { name: 'Points d’attention' });
    expect(within(warnings).getByText('3 · Retours DG en retard')).toBeInTheDocument();
    expect(within(warnings).getByText(/Plus ancien : DEM-2026-0012 · depuis le 02\/09\/2026/)).toBeInTheDocument();
    expect(within(warnings).getByRole('link', { name: /Voir dans Courriers/ })).toHaveAttribute(
      'href',
      '/courriers?tab=with_dg&id=intake_request:12'
    );
  });

  it('recent activity: event labels, references, staff / applicant / no actor', async () => {
    roles = ['reception'];
    mockApi();
    renderWithProviders(<PilotagePage />);
    const activity = await screen.findByRole('region', { name: 'Activité récente' });
    const rows = within(activity).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Mise en circuit DG')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('link', { name: 'DEM-2026-0012' })).toHaveAttribute('href', '/courriers?tab=all&id=intake_request:12');
    expect(rows[0]).toHaveTextContent('Awa Mba');
    expect(rows[1]).toHaveTextContent('Preuve de paiement reçue');
    expect(rows[1]).toHaveTextContent('Postulant');
    expect(rows[2]).toHaveTextContent('DEM-2026-0014 · —');
  });

  it('empty period: quiet messages, current metrics still shown, no fabricated warning', async () => {
    roles = ['reception'];
    mockApi(
      overview({
        metrics: [
          { key: 'courrier.sent_to_dg', value: 0, unit: 'count', basis: 'period', reliability: 'reliable', previousValue: 0 },
          { key: 'courrier.average_dg_circuit_duration', value: null, unit: 'calendar_days', basis: 'period', sampleSize: 0, reliability: 'reliable' },
          { key: 'courrier.to_print_backlog', value: 4, unit: 'count', basis: 'current', reliability: 'reliable' },
        ],
      })
    );
    renderWithProviders(<PilotagePage />);
    expect(await screen.findByText('Aucune activité sur cette période.')).toBeInTheDocument();
    expect(screen.getByText('Aucun point d’attention actuellement.')).toBeInTheDocument();
    expect(screen.getByText('Aucune activité récente sur cette période.')).toBeInTheDocument();
    expect(within(screen.getByText('Durée moyenne du circuit DG').closest('li')!).getByText('—')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Situation actuelle' })).getByText('4')).toBeInTheDocument();
  });
});

describe('<PilotagePage> errors', () => {
  const reject = (status: number, data: object) =>
    vi.spyOn(api, 'get').mockRejectedValue(
      new AxiosError('failed', String(status), undefined, undefined, {
        status,
        data,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
      })
    );

  it('403: an access message, not a server failure', async () => {
    roles = ['reception'];
    reject(403, { code: 'ROLE_ANALYTICS_FORBIDDEN', message: 'Accès refusé.' });
    renderWithProviders(<PilotagePage />);
    expect(await screen.findByText('Accès non autorisé')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Réessayer/ })).toBeNull();
  });

  it('400: the period message from the API', async () => {
    roles = ['reception'];
    reject(400, { code: 'INVALID_ANALYTICS_PERIOD', message: 'Période d’analyse invalide.' });
    renderWithProviders(<PilotagePage />);
    expect(await screen.findByText('Période invalide')).toBeInTheDocument();
    expect(screen.getByText('Période d’analyse invalide.')).toBeInTheDocument();
  });

  it('501: a controlled « Tableau indisponible », no value shown', async () => {
    roles = ['reception'];
    reject(501, { code: 'ROLE_ANALYTICS_NOT_IMPLEMENTED' });
    renderWithProviders(<PilotagePage />);
    expect(await screen.findByText('Tableau indisponible')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Sur la période' })).toBeNull();
  });
});
