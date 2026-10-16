import { cn } from '../../lib/utils';

export interface CockpitMetric {
  key: string;
  label: string;
  value: number | string;
  /** e.g. « dont 2 en retard »; null hides it. */
  detail?: string | null;
  tone: 'info' | 'warning' | 'success' | 'danger' | 'neutral';
}

const TONES: Record<CockpitMetric['tone'], string> = {
  info: 'border-blue-100 bg-blue-50 text-anac-blue',
  warning: 'border-orange-100 bg-orange-50 text-anac-warning',
  success: 'border-green-100 bg-green-50 text-anac-success',
  danger: 'border-red-100 bg-red-50 text-anac-danger',
  neutral: 'border-anac-border bg-white text-anac-navy',
};

/** One metric strip for every role cockpit (replaces the local metric cards). */
export function CockpitMetrics({ items }: { items: CockpitMetric[] }) {
  return (
    <ul aria-label="Synthèse" className="flex flex-wrap gap-2">
      {items.map((metric) => (
        <li key={metric.key} className={cn('rounded-lg border px-3 py-1.5 text-xs', TONES[metric.tone])}>
          <span className="font-semibold">{metric.value}</span> {metric.label}
          {metric.detail ? <span className="opacity-80"> · {metric.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}
