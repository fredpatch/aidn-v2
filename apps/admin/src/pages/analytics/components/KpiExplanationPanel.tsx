import { BookOpen, Target } from 'lucide-react';
import type { AnalyticsPhaseStat } from '../../../lib/api/analytics.types';
import { KPI_EXPLANATIONS, PHASE_LABELS } from '../analytics.helpers';

function formatTargetName(phase: AnalyticsPhaseStat): string {
  return PHASE_LABELS[phase.phaseCode] ?? phase.label;
}

export function KpiExplanationPanel({ phases }: { phases: AnalyticsPhaseStat[] }) {
  return (
    <section className="rounded-lg border border-anac-border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-anac-navy">
            <BookOpen size={16} aria-hidden="true" />
            <h2 className="text-sm font-semibold">Comprendre les indicateurs</h2>
          </div>
          <p className="mt-1 text-[12px] text-anac-muted">
            Lecture opérationnelle des KPIs pour le pilotage DN.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-[11px] font-semibold text-anac-blue">
          <Target size={14} aria-hidden="true" />
          SLA = délai cible de traitement
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {KPI_EXPLANATIONS.map((item) => (
            <article key={item.key} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-[12px] font-semibold text-anac-navy">{item.label}</h3>
              <p className="mt-1 text-[11px] leading-5 text-anac-muted">{item.definition}</p>
              <p className="mt-2 text-[11px] font-semibold leading-5 text-anac-blue">{item.dnValue}</p>
            </article>
          ))}
        </div>

        <div className="rounded-md border border-slate-200 p-3">
          <h3 className="text-[12px] font-semibold text-anac-navy">Cibles SLA par phase</h3>
          <div className="mt-2 space-y-2">
            {phases.map((phase) => (
              <div key={phase.phaseCode} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-anac-muted">{formatTargetName(phase)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-anac-navy">
                  {phase.slaTargetDays} j
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
