import { cn } from '../../../lib/utils';
import type { DashboardPerformanceMetric } from '../../../lib/api/dashboard.types';
import { DashboardSection } from './DashboardSection';

export function ProgressMetricCard({ items }: { items: DashboardPerformanceMetric[] }) {
  return (
    <DashboardSection className="p-5" title="Progression globale">
      <div className="mt-5 space-y-4">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
              <span className="font-medium text-anac-navy">{item.label}</span>
              <span className="min-w-[56px] text-right text-anac-muted">{item.value}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100">
              <div
                className={cn(
                  'h-1.5 rounded-full',
                  item.tone === 'success'
                    ? 'bg-anac-success'
                    : item.tone === 'warning'
                      ? 'bg-anac-warning'
                      : 'bg-anac-sky'
                )}
                style={{ width: `${Math.min(Math.max(item.percentage, 2), 100)}%` }}
              />
            </div>
            {item.target ? <p className="mt-1 text-[11px] text-anac-muted">{item.target}</p> : null}
            {item.helper ? <p className="mt-1 text-[11px] text-anac-muted">{item.helper}</p> : null}
          </div>
        ))}
      </div>
    </DashboardSection>
  );
}
