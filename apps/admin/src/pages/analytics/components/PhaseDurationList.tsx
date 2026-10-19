import { formatCalendarDuration } from '@aidn/shared';
import type { AnalyticsPhaseStat } from '../../../lib/api/analytics.types';
import { PHASE_LABELS, formatSlaTarget } from '../analytics.helpers';

/** Average closed duration of each phase next to its SLA target (calendar days, never hours). */
export function PhaseDurationList({ phases }: { phases: AnalyticsPhaseStat[] }) {
  return (
    <section aria-label="Temps moyen par phase" className="rounded-lg border border-anac-border bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-anac-navy">Temps moyen par phase</h2>
      <p className="text-[11px] text-anac-muted">Durée moyenne des phases clôturées sur la période, et leur délai cible.</p>
      <div className="mt-3 divide-y divide-anac-border">
        {phases.map((phase) => (
          <div key={phase.phaseCode} className="grid grid-cols-[1fr_auto_auto] gap-3 py-2 text-[12px]">
            <span className="font-semibold text-anac-navy">{PHASE_LABELS[phase.phaseCode] ?? phase.label}</span>
            <span className="text-anac-muted">
              Moyenne : <span className="font-semibold text-anac-navy">{formatCalendarDuration(phase.averageClosedDurationDays)}</span>
            </span>
            <span className="text-anac-muted">Cible SLA : {formatSlaTarget(phase.slaTargetDays)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
