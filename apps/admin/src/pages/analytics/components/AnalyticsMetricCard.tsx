import { AlertTriangle } from 'lucide-react';
import type { AnalyticsMetric } from '../../../lib/api/analytics.types';
import { cn } from '../../../lib/utils';
import { METRIC_ICONS, TONE_STYLES } from '../analytics.helpers';

export function AnalyticsMetricCard({ metric }: { metric: AnalyticsMetric }) {
  const Icon = METRIC_ICONS[metric.key] ?? AlertTriangle;

  return (
    <article className="min-h-[120px] rounded-lg border border-anac-border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-anac-muted">{metric.label}</p>
          <p className="mt-2 text-[25px] font-semibold leading-none text-anac-navy">{metric.value}</p>
        </div>
        <div className={cn('rounded-lg border p-2.5', TONE_STYLES[metric.tone])}>
          <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-anac-muted">{metric.helper}</span>
        {metric.sampleSize !== undefined ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
            base {metric.sampleSize}
          </span>
        ) : null}
        {metric.warning ? (
          <span className="rounded-full bg-orange-50 px-2 py-0.5 font-semibold text-orange-700">
            {metric.warning}
          </span>
        ) : null}
      </div>
    </article>
  );
}
