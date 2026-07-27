import { AlertCircle, CheckCircle2, Info, Lock } from 'lucide-react';

export interface PhaseWorkflowMetric {
  label: string;
  value: string;
}

export interface PhaseWorkflowSummaryState {
  title: string;
  description: string;
  owner: string;
  tone: 'info' | 'warning' | 'success' | 'muted';
  phaseStatus: string;
  blockReason?: string | null;
  metrics: PhaseWorkflowMetric[];
}

interface PhaseWorkflowSummaryProps {
  state: PhaseWorkflowSummaryState;
}

const toneStyles = {
  info: {
    icon: Info,
    wrapper: 'border-anac-info/30 bg-anac-info/5',
    badge: 'bg-anac-info/10 text-anac-info',
  },
  warning: {
    icon: AlertCircle,
    wrapper: 'border-anac-warning/30 bg-anac-warning/5',
    badge: 'bg-anac-warning/10 text-anac-warning',
  },
  success: {
    icon: CheckCircle2,
    wrapper: 'border-anac-success/30 bg-anac-success/5',
    badge: 'bg-anac-success/10 text-anac-success',
  },
  muted: {
    icon: Lock,
    wrapper: 'border-anac-border bg-white',
    badge: 'bg-anac-muted/10 text-anac-muted',
  },
};

export default function PhaseWorkflowSummary({ state }: PhaseWorkflowSummaryProps) {
  const tone = toneStyles[state.tone];
  const Icon = tone.icon;
  const phaseLabel = state.phaseStatus === 'closed' ? 'Clôturée' : 'Ouverte';

  return (
    <section className={`border rounded-lg p-4 ${tone.wrapper}`} aria-labelledby="phase-action">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex gap-3">
          <Icon size={18} className="mt-0.5 flex-shrink-0 text-anac-navy" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="phase-action" className="text-base font-semibold text-anac-navy">
                {state.title}
              </h2>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone.badge}`}>
                {phaseLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-anac-text">{state.description}</p>
            {state.blockReason && state.phaseStatus !== 'closed' && (
              <p className="mt-2 text-xs font-medium text-anac-warning">{state.blockReason}</p>
            )}
          </div>
        </div>

        <dl className="grid gap-3 text-xs sm:grid-cols-3 lg:min-w-[360px]">
          {state.metrics.map((metric) => (
            <div key={metric.label} className="border-l border-anac-border pl-3">
              <dt className="text-anac-muted">{metric.label}</dt>
              <dd className="mt-1 font-semibold text-anac-navy">{metric.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
