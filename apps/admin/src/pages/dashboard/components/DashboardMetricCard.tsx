import { Link } from 'react-router-dom';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { DashboardMetric } from '../../../lib/api/dashboard.types';
import { FALLBACK_METRIC_ICON, METRIC_ICONS, TONE_STYLES } from '../dashboard.helpers';
import { DashboardSection } from './DashboardSection';

export function DashboardMetricCard({ metric }: { metric: DashboardMetric }) {
  const Icon = METRIC_ICONS[metric.key] ?? FALLBACK_METRIC_ICON;
  const TrendIcon = metric.trend?.direction === 'down' ? TrendingDown : TrendingUp;

  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-anac-muted">{metric.label}</p>
          <p className="mt-2 text-[26px] font-semibold leading-none text-anac-navy">
            {metric.value}
          </p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-anac-blue">
          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        </div>
      </div>
      <div className="mt-4 space-y-2 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-anac-muted">{metric.helper}</span>
          {metric.trend ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold',
                TONE_STYLES[metric.trend.tone]
              )}
            >
              <TrendIcon size={12} aria-hidden="true" />
              {metric.trend.value}
            </span>
          ) : null}
        </div>
        <p className="text-anac-muted">
          {metric.periodLabel}
          {metric.sampleSize !== undefined ? ` - base ${metric.sampleSize}` : ''}
        </p>
        {metric.definition ? (
          <p className="line-clamp-2 text-anac-muted">{metric.definition}</p>
        ) : null}
      </div>
    </>
  );

  return (
    <DashboardSection className="min-h-[148px] p-4">
      {metric.href ? (
        <Link
          to={metric.href}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
        >
          {content}
        </Link>
      ) : (
        content
      )}
    </DashboardSection>
  );
}
