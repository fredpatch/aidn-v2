/** ANALYTICS-GLOBAL-UX-1 - /analytique readability: durations from raw
 *  calendar days, SLA targets in calendar days, chart configuration (raw
 *  numbers in, formatted tooltips out, an explicit « Cible SLA » series),
 *  and the reading keys. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { formatCalendarDuration } from '@aidn/shared';
import type {
  AnalyticsMetric,
  AnalyticsPhaseStat,
  AnalyticsTrendPoint,
} from '../../lib/api/analytics.types';

vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="line-chart" />,
  Bar: () => <div data-testid="bar-chart" />,
  Doughnut: () => <div data-testid="doughnut-chart" />,
}));

const { AnalyticsMetricCard } = await import('./components/AnalyticsMetricCard');
const { PhaseDurationList } = await import('./components/PhaseDurationList');
const { KpiExplanationPanel } = await import('./components/KpiExplanationPanel');
const { DurationTrendChart, PhaseDurationChart } = await import('./components/AnalyticsCharts');
const config = await import('./components/analyticsChartConfig');
const { metricDisplayValue } = await import('./analytics.helpers');

const phase = (
  phaseCode: AnalyticsPhaseStat['phaseCode'],
  average: number | null,
  sla: number
): AnalyticsPhaseStat => ({
  phaseCode,
  label: phaseCode,
  activeCount: 1,
  closedCount: 2,
  averageClosedDurationDays: average,
  averageActiveAgeDays: null,
  slaTargetDays: sla,
  slaBreachCount: 0,
});
const PHASES = [phase('M3', 4.8, 15), phase('M4', 20.5, 15), phase('M5', null, 30)];

const metric = (partial: Partial<AnalyticsMetric>): AnalyticsMetric => ({
  key: 'average_processing_duration',
  label: 'Délai moyen de traitement',
  value: '4.8 j',
  helper: 'Dépôt initial -> clôture délivrance',
  tone: 'info',
  ...partial,
});

describe('calendar durations (shared formatter)', () => {
  it.each([
    [0.1, '2 h 24 min'],
    [0.5, '12 h'],
    [1, '1 j'],
    [1.25, '1 j 6 h'],
    [4.8, '4 j 19 h'],
    [6.8, '6 j 19 h'],
    [null, '-'],
  ])('%s -> %s', (days, expected) => {
    expect(formatCalendarDuration(days)).toBe(expected);
  });
});

describe('KPI cards', () => {
  it('a duration metric shows its raw days humanized, never the legacy « 4.8 j » text', () => {
    render(<AnalyticsMetricCard metric={metric({ rawValue: 4.8, unit: 'calendar_days' })} />);
    expect(screen.getByText('4 j 19 h')).toBeInTheDocument();
    expect(screen.queryByText('4.8 j')).toBeNull();
  });

  it('count and percent metrics keep the API text; a duration without sample reads « - »', () => {
    expect(metricDisplayValue(metric({ key: 'outside_sla', value: '3' }))).toBe('3');
    expect(metricDisplayValue(metric({ key: 'sla_compliance', value: '75%' }))).toBe('75%');
    expect(metricDisplayValue(metric({ rawValue: null, unit: 'calendar_days', value: '-' }))).toBe(
      '-'
    );
    expect(metricDisplayValue(metric({ value: '4.8 j' }))).toBe('4.8 j');
  });
});

describe('phase list', () => {
  it('average humanized, SLA target spelled out in calendar days', () => {
    render(<PhaseDurationList phases={PHASES} />);
    const rows = within(screen.getByRole('region', { name: 'Temps moyen par phase' }));
    expect(rows.getByText('Préliminaire').parentElement).toHaveTextContent(
      'Moyenne : 4 j 19 hCible SLA : 15 jours calendaires'
    );
    expect(rows.getByText('Évaluation approfondie').parentElement).toHaveTextContent(
      'Moyenne : -Cible SLA : 30 jours calendaires'
    );
  });
});

describe('chart configuration', () => {
  const TREND: AnalyticsTrendPoint[] = [
    { date: '2026-10-01', averageDurationDays: 4.8, medianDurationDays: 3.5 },
    { date: '2026-10-08', averageDurationDays: null, medianDurationDays: 0.1 },
  ];

  it('trend: raw days, « Moyenne » / « Médiane », unit on the axis, humanized tooltip', () => {
    const data = config.trendChartData(TREND);
    expect(data.labels).toEqual(['01/10', '08/10']);
    expect(data.datasets.map((d) => d.label)).toEqual(['Moyenne', 'Médiane']);
    expect(data.datasets[0].data).toEqual([4.8, null]);
    const options = config.trendChartOptions();
    expect(options.scales?.y?.title).toMatchObject({
      display: true,
      text: 'Durée - jours calendaires',
    });
    expect(config.durationTooltipLabel('Moyenne', 4.8)).toBe('Moyenne : 4 j 19 h');
    expect(config.durationTooltipLabel('Médiane', 0.1)).toBe('Médiane : 2 h 24 min');
  });

  it('phases: an explicit « Cible SLA » series next to the average (red above target kept), formatted tooltips', () => {
    const data = config.phaseChartData(PHASES);
    expect(data.labels).toEqual(['Préliminaire', 'Demande formelle', 'Évaluation approfondie']);
    expect(data.datasets.map((d) => d.label)).toEqual(['Durée moyenne', 'Cible SLA']);
    expect(data.datasets[0].data).toEqual([4.8, 20.5, null]);
    expect(data.datasets[1].data).toEqual([15, 15, 30]);
    expect(data.datasets[0].backgroundColor).toEqual(['#2563EB', '#DC2626', '#2563EB']);
    expect(config.phaseChartOptions().plugins?.legend).toMatchObject({ position: 'bottom' });
    expect(config.phaseTooltipLabel(0, 'Durée moyenne', 20.5)).toBe('Durée moyenne : 20 j 12 h');
    expect(config.phaseTooltipLabel(0, 'Durée moyenne', null)).toBe(
      'Durée moyenne : aucune phase clôturée'
    );
    expect(config.phaseTooltipLabel(1, 'Cible SLA', 15)).toBe('Cible SLA : 15 jours calendaires');
  });

  it('empty data: an explanatory message instead of an empty chart', () => {
    const { unmount } = render(
      <DurationTrendChart
        points={[{ date: '2026-10-01', averageDurationDays: null, medianDurationDays: null }]}
      />
    );
    expect(
      screen.getByText('Aucun dossier clôturé pour tracer une évolution.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).toBeNull();
    unmount();
    render(<PhaseDurationChart phases={[phase('M3', null, 15)]} />);
    expect(screen.getByText(/seules les cibles SLA sont affichées/)).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });
});

describe('Comprendre les indicateurs', () => {
  it('KPI and SLA spelled out, average vs median, calendar vs working days, SLA targets in calendar days', () => {
    render(<KpiExplanationPanel phases={PHASES} />);
    const keys = within(screen.getByLabelText('Repères de lecture'));
    expect(keys.getByText('KPI')).toHaveTextContent('KPI - Indicateur clé de performance');
    expect(keys.getByText('SLA')).toHaveTextContent('SLA - Délai cible de traitement');
    expect(keys.getByText(/Mesure utilisée pour suivre l’activité/)).toBeInTheDocument();
    expect(keys.getByText(/Durée moyenne calculée sur tous les dossiers/)).toBeInTheDocument();
    expect(
      keys.getByText(/moins influencée par quelques dossiers exceptionnellement longs/)
    ).toBeInTheDocument();
    expect(keys.getByText('Tous les jours du calendrier sont comptés.')).toBeInTheDocument();
    expect(
      keys.getByText(/Seuls les jours de travail du calendrier opérationnel/)
    ).toBeInTheDocument();
    expect(screen.getAllByText('15 jours calendaires')).toHaveLength(2);
  });
});
