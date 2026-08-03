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

const chartTextColor = '#1E3A8A';
const gridColor = '#E2E8F0';

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
  const values = points.map((point) => point.averageDurationDays);
  const medianValues = points.map((point) => point.medianDurationDays);
  const hasData = hasSeriesData(values) || hasSeriesData(medianValues);

  return (
    <AnalyticsSection
      title="Evolution du delai moyen de traitement"
      subtitle="Dossiers clotures sur la periode selectionnee"
      className="p-0"
    >
      <div className="p-4">
        {hasData ? (
          <Line
            height={210}
            data={{
              labels: points.map((point) => point.date.slice(5)),
              datasets: [
                {
                  label: 'Delai moyen',
                  data: values,
                  borderColor: '#1D4ED8',
                  backgroundColor: 'rgba(29, 78, 216, 0.08)',
                  fill: true,
                  tension: 0.35,
                },
                {
                  label: 'Mediane',
                  data: medianValues,
                  borderColor: '#16A34A',
                  borderDash: [5, 5],
                  tension: 0.35,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { labels: { color: chartTextColor, boxWidth: 10 } } },
              scales: {
                y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: chartTextColor } },
                x: { grid: { display: false }, ticks: { color: chartTextColor } },
              },
            }}
          />
        ) : (
          <EmptyChart label="Aucun dossier cloture pour tracer une evolution." />
        )}
      </div>
    </AnalyticsSection>
  );
}

export function PhaseDurationChart({ phases }: { phases: AnalyticsPhaseStat[] }) {
  const hasData = hasSeriesData(phases.map((phase) => phase.averageClosedDurationDays));

  return (
    <AnalyticsSection title="Temps moyen par phase" subtitle="En jours" className="p-0">
      <div className="p-4">
        {hasData ? (
          <Bar
            height={210}
            data={{
              labels: phases.map((phase) => phase.label),
              datasets: [
                {
                  label: 'Duree moyenne',
                  data: phases.map((phase) => phase.averageClosedDurationDays ?? 0),
                  backgroundColor: phases.map((phase) =>
                    (phase.averageClosedDurationDays ?? 0) > phase.slaTargetDays ? '#DC2626' : '#2563EB'
                  ),
                  borderRadius: 8,
                  barThickness: 13,
                },
              ],
            }}
            options={{
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { grid: { display: false }, ticks: { color: chartTextColor, font: { size: 11 } } },
                x: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: chartTextColor } },
              },
            }}
          />
        ) : (
          <EmptyChart label="Aucune phase cloturee sur cette periode." />
        )}
      </div>
    </AnalyticsSection>
  );
}

export function DistributionChart({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: AnalyticsDistributionItem[];
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
                plugins: { legend: { display: false } },
              }}
            />
          </div>
        ) : (
          <div className="flex h-[150px] items-center justify-center rounded-md bg-slate-50 text-xs text-anac-muted">
            Aucune donnee
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
            Total {total}
          </div>
        </div>
      </div>
    </AnalyticsSection>
  );
}
