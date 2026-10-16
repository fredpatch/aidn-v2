import type { ReactNode } from 'react';
import type { ApplicantAction } from '@aidn/shared';
import { actionCopy } from '../../lib/actions/copy';

export type PhaseTone = 'info' | 'warning' | 'success' | 'muted';

const TONE_STYLES: Record<PhaseTone, string> = {
  info: 'border-anac-border bg-white',
  muted: 'border-anac-border bg-white',
  warning: 'border-anac-warning/40 bg-anac-warning/5',
  success: 'border-anac-success/30 bg-anac-success/5',
};

/**
 * Header card of a phase: phase name, current situation, open/closed badge, steps.
 * SESSION1-UX-1 - `action` (the top applicant action of this phase, from the API)
 * replaces the builder's passive wording, with a link to its anchor.
 */
export function PhaseSummaryCard({
  phaseLabel,
  title,
  description,
  tone,
  closed,
  action,
  children,
}: {
  phaseLabel: string;
  title: string;
  description: string;
  tone: PhaseTone;
  closed: boolean;
  action?: ApplicantAction;
  children: ReactNode;
}) {
  const copy = action ? actionCopy(action) : null;

  return (
    <div className={`rounded-lg border p-4 ${TONE_STYLES[copy ? 'warning' : tone]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-anac-navy">{phaseLabel}</p>
          <h3 className="mt-1 text-base font-semibold text-anac-navy">{copy ? copy.phaseTitle : title}</h3>
          <p className="mt-1 text-sm text-anac-muted">{copy ? copy.phaseDescription : description}</p>
          {action && copy && (
            <a href={`#${action.anchor}`} className="btn-primary mt-2 inline-flex rounded px-3 py-1.5 text-xs no-underline">
              {copy.phaseCta}
            </a>
          )}
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
