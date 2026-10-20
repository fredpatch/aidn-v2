import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import type {
  AnalyticsDistributionItem,
  AnalyticsPhaseStat,
  AnalyticsTrendPoint,
} from '../../../lib/api/analytics.types';
import {
  countLabel,
  distributionTooltipLabel,
  phaseChartData,
  phaseChartOptions,
  trendChartData,
  trendChartOptions,
  type CountNoun,
} from './analyticsChartConfig';
import { AnalyticsSection } from './AnalyticsSection';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
);

function hasSeriesData(values: Array<number | null | undefined>): boolean {
  return values.some((value) => typeof value === 'number' && value > 0);
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[210px] items-center justify-center rounded-md bg-slate-50 text-sm text-anac-muted">
      {label}
    </div>
  );
}

export function DurationTrendChart({ points }: { points: AnalyticsTrendPoint[] }) {
  const hasData =
    hasSeriesData(points.map((point) => point.averageDurationDays)) ||
    hasSeriesData(points.map((point) => point.medianDurationDays));

  return (
    <AnalyticsSection
      title="Évolution du délai de traitement"
      subtitle="Moyenne et médiane des dossiers clôturés, en jours calendaires"
      className="p-0"
    >
      <div className="p-4">
        {hasData ? (
          <Line height={210} data={trendChartData(points)} options={trendChartOptions()} />
        ) : (
          <EmptyChart label="Aucun dossier clôturé pour tracer une évolution." />
        )}
      </div>
    </AnalyticsSection>
  );
}

export function PhaseDurationChart({ phases }: { phases: AnalyticsPhaseStat[] }) {
  const hasAverage = hasSeriesData(phases.map((phase) => phase.averageClosedDurationDays));

  return (
    <AnalyticsSection
      title="Durée moyenne par phase et cible SLA"
      subtitle="Phases clôturées sur la période, comparées à leur délai cible"
      className="p-0"
    >
      <div className="p-4">
        {phases.length ? (
          <>
            {hasAverage ? null : (
              <p className="mb-2 text-[11px] text-anac-muted">Aucune phase clôturée sur cette période : seules les cibles SLA sont affichées.</p>
            )}
            <div className="h-[230px]">
              <Bar data={phaseChartData(phases)} options={phaseChartOptions()} />
            </div>
          </>
        ) : (
          <EmptyChart label="Aucune phase sur cette période." />
        )}
      </div>
    </AnalyticsSection>
  );
}

export function DistributionChart({
  title,
  subtitle,
  items,
  noun,
}: {
  title: string;
  subtitle: string;
  items: AnalyticsDistributionItem[];
  /** What is counted: the total and the tooltip name it (never a bare « Total N »). */
  noun?: CountNoun;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <AnalyticsSection title={title} subtitle={subtitle} className="p-0">
      <div className="grid gap-4 p-4 md:grid-cols-[150px_1fr]">
        {total > 0 ? (
          <div className="h-[150px]">
            <Doughnut
              data={{
                labels: items.map((item) => item.label),
                datasets: [
                  {
                    data: items.map((item) => item.value),
                    backgroundColor: items.map((item) => item.color),
                    borderColor: '#FFFFFF',
                    borderWidth: 4,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (item) => distributionTooltipLabel(item.label, Number(item.raw), total, noun),
                    },
                  },
                },
              }}
            />
          </div>
        ) : (
          <div className="flex h-[150px] items-center justify-center rounded-md bg-slate-50 text-xs text-anac-muted">
            Aucune donnée
          </div>
        )}
        <div className="space-y-2 self-center">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="flex items-center gap-2 text-anac-muted">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                {item.label}
              </span>
              <span className="font-semibold text-anac-navy">
                {item.value} {total > 0 ? `(${Math.round((item.value / total) * 100)}%)` : ''}
              </span>
            </div>
          ))}
          <div className="border-t border-anac-border pt-2 text-[12px] font-semibold text-anac-navy">
            {noun ? countLabel(total, noun) : `Total ${total}`}
          </div>
        </div>
      </div>
    </AnalyticsSection>
  );
}
