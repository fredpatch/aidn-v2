import { CheckCircle2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { DashboardPhaseStat } from '../../../lib/api/dashboard.types';
import { SLA_STYLES } from '../dashboard.helpers';
import { DashboardSection } from './DashboardSection';

export function WorkflowPhaseSummary({ phases }: { phases: DashboardPhaseStat[] }) {
  return (
    <DashboardSection
      className="p-5"
      title="Vue d'ensemble du workflow"
      description="Repartition par phase ouverte et duree moyenne."
    >
      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-5">
        {phases.map((phase, index) => (
          <div key={phase.phaseCode} className="relative min-w-0">
            {index < phases.length - 1 ? (
              <div
                className={cn(
                  'absolute left-[52%] right-[-48%] top-3.5 hidden h-px sm:block',
                  phase.count > 0 ? 'bg-anac-blue' : 'bg-anac-border'
                )}
              />
            ) : null}
            <div className="relative z-10 flex flex-col items-start gap-2 sm:items-center">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border bg-white text-[12px] font-semibold',
                  phase.count > 0
                    ? 'border-anac-success bg-green-50 text-anac-success'
                    : 'border-anac-border text-anac-muted'
                )}
              >
                {phase.count > 0 ? <CheckCircle2 size={16} aria-hidden="true" /> : index + 1}
              </div>
              <div className="text-left sm:text-center">
                <p className="text-[12px] font-semibold text-anac-navy">{phase.label}</p>
                <p className="mt-2 text-lg font-semibold leading-none text-anac-navy">
                  {phase.count > 0 ? phase.count : '0'}
                </p>
                <p className="mt-1 text-[11px] text-anac-muted">
                  {phase.count > 0 ? `${phase.percentage}% des phases ouvertes` : phase.emptyLabel}
                </p>
                <p className="text-[11px] text-anac-blue">
                  {phase.averageDurationDays === null
                    ? phase.durationLabel ?? 'Duree non disponible'
                    : `${phase.averageDurationDays} j moyen`}
                </p>
                {phase.slaLabel ? (
                  <span
                    className={cn(
                      'mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                      SLA_STYLES[phase.slaStatus ?? 'unknown']
                    )}
                  >
                    {phase.slaBreachCount ? `${phase.slaBreachCount} hors delai` : phase.slaLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </DashboardSection>
  );
}
