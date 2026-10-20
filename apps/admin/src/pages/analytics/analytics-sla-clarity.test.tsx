/** ANALYTICS-SLA-CLARITY-1 - the two donuts count different things and say
 *  so: active dossiers by age, phases closed in the period against their own
 *  target. Phase names are business names, never M3-M7. */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { AnalyticsOverview, AnalyticsPhaseStat } from '../../lib/api/analytics.types';
import { renderWithProviders } from '../../test/render';

vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="line-chart" />,
  Bar: () => <div data-testid="bar-chart" />,
  Doughnut: () => <div data-testid="doughnut-chart" />,
}));

const overview = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../../lib/api/analytics.api', () => ({ fetchAnalyticsOverview: () => Promise.resolve(overview.current) }));
vi.mock('../../lib/api/reports.api', () => ({ fetchGeneratedReports: () => Promise.resolve([]), generateReport: vi.fn() }));

const { default: AnalyticsPage } = await import('./AnalyticsPage');
const { DistributionChart } = await import('./components/AnalyticsCharts');
const config = await import('./components/analyticsChartConfig');
const { PHASE_OPTIONS, KPI_EXPLANATIONS } = await import('./analytics.helpers');

const phase = (phaseCode: AnalyticsPhaseStat['phaseCode'], label: string): AnalyticsPhaseStat => ({
  phaseCode,
  label,
  activeCount: 1,
  closedCount: 2,
  averageClosedDurationDays: 3,
  averageActiveAgeDays: 1,
  slaTargetDays: 15,
  slaBreachCount: 0,
});

// The screenshot scenario: 2 active dossiers; 12 phases closed, 3 within target.
function scenario(): AnalyticsOverview {
  return {
    filters: { periodStart: '2026-10-01', periodEnd: '2026-10-31' },
    generatedAt: '2026-10-20T08:00:00.000Z',
    warnings: [],
    metrics: [
      { key: 'outside_sla', label: 'Phases hors délai', value: '1', helper: 'Phases ouvertes au-delà de leur cible SLA', tone: 'danger', sampleSize: 2, sampleLabel: '2 phases ouvertes' },
      { key: 'sla_compliance', label: 'Taux de respect SLA', value: '25%', helper: 'Phases clôturées dans le délai cible', tone: 'success', sampleSize: 12, sampleLabel: '12 phases clôturées' },
    ],
    durationTrend: [],
    phaseStats: [
      phase('M3', 'Préliminaire'),
      phase('M4', 'Demande formelle'),
      phase('M5', 'Évaluation approfondie'),
      phase('M6', 'Démonstration / Inspection'),
      phase('M7', 'Délivrance'),
    ],
    agingDistribution: [
      { label: '0 - 7 jours', value: 1, color: '#16A34A' },
      { label: '8 - 15 jours', value: 1, color: '#F59E0B' },
      { label: '16 - 30 jours', value: 0, color: '#F97316' },
      { label: '30+ jours', value: 0, color: '#DC2626' },
    ],
    slaDistribution: [
      { label: 'Dans le délai cible', value: 3, color: '#16A34A' },
      { label: 'Au-delà du délai cible', value: 9, color: '#DC2626' },
    ],
    blockingPoints: [],
    delayedDossiers: [],
    meetingFollowUps: { missingReports: [], missingR3Opinions: [] },
    reports: [],
  } as unknown as AnalyticsOverview;
}

const section = (title: string) => screen.getByRole('heading', { name: title }).closest('section')!;

describe('/analytique - SLA and age donuts', () => {
  it('two named populations: « 2 dossiers actifs » versus « 12 phases clôturées », legend per target', async () => {
    overview.current = scenario();
    renderWithProviders(<AnalyticsPage />);
    await screen.findByRole('heading', { name: 'Respect des SLA - phases clôturées' });

    const age = section('Ancienneté des dossiers actifs');
    expect(within(age).getByText('Dossiers actifs selon le temps écoulé depuis le dépôt')).toBeInTheDocument();
    expect(within(age).getByText('2 dossiers actifs')).toBeInTheDocument();

    const sla = section('Respect des SLA - phases clôturées');
    expect(within(sla).getByText('Phases clôturées sur la période, comparées à leur délai cible')).toBeInTheDocument();
    expect(within(sla).getByText('Dans le délai cible')).toBeInTheDocument();
    expect(within(sla).getByText('Au-delà du délai cible')).toBeInTheDocument();
    expect(within(sla).getByText('3 (25%)')).toBeInTheDocument();
    expect(within(sla).getByText('9 (75%)')).toBeInTheDocument();
    expect(within(sla).getByText('12 phases clôturées')).toBeInTheDocument();

    expect(screen.queryByText(/^Total \d+$/)).toBeNull();
    expect(screen.queryByText(/Dossiers (dans les délais|hors délai)/)).toBeNull();
  });

  it('singular: « 1 phase clôturée », « 1 dossier actif »; without a noun the old « Total N » stays', () => {
    const { rerender } = renderWithProviders(
      <DistributionChart title="SLA" subtitle="-" items={[{ label: 'Dans le délai cible', value: 1, color: '#000' }]} noun={{ singular: 'phase clôturée', plural: 'phases clôturées' }} />
    );
    expect(screen.getByText('1 phase clôturée')).toBeInTheDocument();
    rerender(
      <DistributionChart title="Âge" subtitle="-" items={[{ label: '0 - 7 jours', value: 1, color: '#000' }]} noun={{ singular: 'dossier actif', plural: 'dossiers actifs' }} />
    );
    expect(screen.getByText('1 dossier actif')).toBeInTheDocument();
    rerender(<DistributionChart title="X" subtitle="-" items={[{ label: 'A', value: 4, color: '#000' }]} />);
    expect(screen.getByText('Total 4')).toBeInTheDocument();
  });

  it('donut tooltip names the phases and their share', () => {
    const noun = { singular: 'phase clôturée', plural: 'phases clôturées' };
    expect(config.distributionTooltipLabel('Au-delà du délai cible', 9, 12, noun)).toBe('Au-delà du délai cible : 9 phases clôturées (75 %)');
    expect(config.distributionTooltipLabel('Dans le délai cible', 1, 4, noun)).toBe('Dans le délai cible : 1 phase clôturée (25 %)');
    expect(config.distributionTooltipLabel('A', 0, 0)).toBe('A : 0');
  });
});

describe('/analytique - current overdue versus closed in the period', () => {
  it('« Phases hors délai » (open now) and « Taux de respect SLA » (closed in the period) stay two indicators', () => {
    const outside = KPI_EXPLANATIONS.find((item) => item.key === 'outside_sla')!;
    const compliance = KPI_EXPLANATIONS.find((item) => item.key === 'sla_compliance')!;
    expect(outside.label).toBe('Phases hors délai');
    expect(outside.definition).toBe("Phases actuellement ouvertes dont l'âge dépasse leur cible SLA.");
    expect(compliance.definition).toBe('Part des phases clôturées dans leur délai cible.');
  });
});

describe('/analytique - business phase names, never M3-M7', () => {
  const NAMES = ['Préliminaire', 'Demande formelle', 'Évaluation approfondie', 'Démonstration / Inspection', 'Délivrance'];

  it('phase filter options and the phase chart use the business names', () => {
    const options = PHASE_OPTIONS.filter((option) => option.value).map((option) => option.label);
    expect(options).toEqual(NAMES);
    const chart = config.phaseChartData(scenario().phaseStats);
    expect(chart.labels).toEqual(NAMES);
  });

  it('the rendered page shows no raw phase code', async () => {
    overview.current = scenario();
    const { container } = renderWithProviders(<AnalyticsPage />);
    await screen.findByRole('heading', { name: 'Respect des SLA - phases clôturées' });
    expect(container.textContent).not.toMatch(/\bM[3-7]\b/);
    for (const name of NAMES) expect(container.textContent).toContain(name);
  });
});
