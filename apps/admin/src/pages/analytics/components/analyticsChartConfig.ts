/** ANALYTICS-GLOBAL-UX-1 - Chart.js data and options for /analytique, kept
 *  pure so they are testable without a canvas. Chart.js always receives raw
 *  calendar days; only tooltips and axis titles are formatted. */
import { countLabel, formatCalendarDuration, type CountNoun } from '@aidn/shared';
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js';
import type { AnalyticsPhaseStat, AnalyticsTrendPoint } from '../../../lib/api/analytics.types';
import { PHASE_LABELS, formatSlaTarget } from '../analytics.helpers';

export const chartTextColor = '#1E3A8A';
export const gridColor = '#E2E8F0';
const AVERAGE_COLOR = '#2563EB';
const OVER_TARGET_COLOR = '#DC2626';
const TARGET_COLOR = '#94A3B8';
export const DURATION_AXIS_TITLE = 'Durée - jours calendaires';

/** « Moyenne : 4 j 19 h »; no value -> « Moyenne : - ». */
export function durationTooltipLabel(seriesLabel: string, days: number | null | undefined): string {
  return `${seriesLabel} : ${formatCalendarDuration(days ?? null)}`;
}

/** ANALYTICS-SLA-CLARITY-1 - what a distribution counts, agreed in number
 *  (shared rule: 0 and 1 take the singular). */
export { countLabel, type CountNoun };

/** « Au-delà du délai cible : 9 phases clôturées (75 %) ». */
export function distributionTooltipLabel(label: string, value: number, total: number, noun?: CountNoun): string {
  const share = total > 0 ? ` (${Math.round((value / total) * 100)} %)` : '';
  return `${label} : ${noun ? countLabel(value, noun) : value}${share}`;
}

export function trendChartData(
  points: AnalyticsTrendPoint[]
): ChartData<'line', Array<number | null>, string> {
  return {
    labels: points.map((point) => point.date.slice(5).split('-').reverse().join('/')),
    datasets: [
      {
        label: 'Moyenne',
        data: points.map((point) => point.averageDurationDays),
        borderColor: '#1D4ED8',
        backgroundColor: 'rgba(29, 78, 216, 0.08)',
        fill: true,
        tension: 0.35,
        pointStyle: 'circle',
      },
      {
        label: 'Médiane',
        data: points.map((point) => point.medianDurationDays),
        borderColor: '#16A34A',
        borderDash: [5, 5],
        tension: 0.35,
        pointStyle: 'rectRot',
      },
    ],
  };
}

export function trendChartOptions(): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: chartTextColor, boxWidth: 10, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (item: TooltipItem<'line'>) =>
            durationTooltipLabel(item.dataset.label ?? '', item.parsed.y),
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: gridColor },
        ticks: { color: chartTextColor },
        title: {
          display: true,
          text: DURATION_AXIS_TITLE,
          color: chartTextColor,
          font: { size: 10 },
        },
      },
      x: { grid: { display: false }, ticks: { color: chartTextColor } },
    },
  };
}

/** Two bars per phase: the average closed duration (red above its target,
 *  as before) and the SLA target, so the comparison never relies on colour. */
export function phaseChartData(
  phases: AnalyticsPhaseStat[]
): ChartData<'bar', Array<number | null>, string> {
  return {
    labels: phases.map((phase) => PHASE_LABELS[phase.phaseCode] ?? phase.label),
    datasets: [
      {
        label: 'Durée moyenne',
        data: phases.map((phase) => phase.averageClosedDurationDays),
        backgroundColor: phases.map((phase) =>
          (phase.averageClosedDurationDays ?? 0) > phase.slaTargetDays
            ? OVER_TARGET_COLOR
            : AVERAGE_COLOR
        ),
        borderRadius: 6,
        barThickness: 10,
      },
      {
        label: 'Cible SLA',
        data: phases.map((phase) => phase.slaTargetDays),
        backgroundColor: TARGET_COLOR,
        borderRadius: 6,
        barThickness: 10,
      },
    ],
  };
}

export function phaseTooltipLabel(
  datasetIndex: number,
  seriesLabel: string,
  days: number | null | undefined
): string {
  if (datasetIndex === 1)
    return `${seriesLabel} : ${days === null || days === undefined ? '-' : formatSlaTarget(days)}`;
  return days === null || days === undefined
    ? `${seriesLabel} : aucune phase clôturée`
    : durationTooltipLabel(seriesLabel, days);
}

export function phaseChartOptions(): ChartOptions<'bar'> {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: chartTextColor, boxWidth: 10 } },
      tooltip: {
        callbacks: {
          label: (item: TooltipItem<'bar'>) =>
            phaseTooltipLabel(item.datasetIndex, item.dataset.label ?? '', item.parsed.x),
        },
      },
    },
    scales: {
      y: { grid: { display: false }, ticks: { color: chartTextColor, font: { size: 11 } } },
      x: {
        beginAtZero: true,
        grid: { color: gridColor },
        ticks: { color: chartTextColor },
        title: {
          display: true,
          text: DURATION_AXIS_TITLE,
          color: chartTextColor,
          font: { size: 10 },
        },
      },
    },
  };
}
