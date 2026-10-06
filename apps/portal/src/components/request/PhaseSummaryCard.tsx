import type { ReactNode } from 'react';

export type PhaseTone = 'info' | 'warning' | 'success' | 'muted';

const TONE_STYLES: Record<PhaseTone, string> = {
  info: 'border-anac-border bg-white',
  muted: 'border-anac-border bg-white',
  warning: 'border-anac-warning/40 bg-anac-warning/5',
  success: 'border-anac-success/30 bg-anac-success/5',
};

/** Header card of a phase: phase name, current situation, open/closed badge, steps. */
export function PhaseSummaryCard({
  phaseLabel,
  title,
  description,
  tone,
  closed,
  children,
}: {
  phaseLabel: string;
  title: string;
  description: string;
  tone: PhaseTone;
  closed: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-4 ${TONE_STYLES[tone]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-anac-navy">{phaseLabel}</p>
          <h3 className="mt-1 text-base font-semibold text-anac-navy">{title}</h3>
          <p className="mt-1 text-sm text-anac-muted">{description}</p>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${
            closed ? 'bg-anac-success/10 text-anac-success' : 'bg-anac-info/10 text-anac-info'
          }`}
        >
          {closed ? 'Clôturée' : 'En cours'}
        </span>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">{children}</div>
    </div>
  );
}
