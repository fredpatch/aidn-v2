import { useState } from 'react';
import { CheckCircle, Circle, CircleDashed, Lock } from 'lucide-react';
import { PHASE_ROADMAP } from '../constants';
import { buildChecklist } from '../helpers';
import type { PreliminaryBundle } from '../types';

interface PhaseSidebarProps {
  bundle: PreliminaryBundle | null;
}

export default function PhaseSidebar({ bundle }: PhaseSidebarProps) {
  const [lockedTooltip, setLockedTooltip] = useState<string | null>(null);

  if (!bundle?.phase) {
    return (
      <div className="card p-4 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-anac-muted mb-3">
          Phases du dossier
        </p>
        {PHASE_ROADMAP.map((phase) => {
          const isCurrent = phase.code === 'M3';
          return (
            <div
              key={phase.code}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-xs"
            >
              {isCurrent ? (
                <Circle size={12} className="text-anac-blue fill-anac-blue flex-shrink-0" />
              ) : (
                <Lock size={11} className="flex-shrink-0 opacity-40" />
              )}
              <span className={isCurrent ? 'text-anac-blue font-semibold' : 'text-anac-muted/60'}>
                {phase.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  const checklist = buildChecklist(bundle);

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-anac-muted mb-3">
          Phases du dossier
        </p>
        {PHASE_ROADMAP.map((phase) => {
          const isCurrent = phase.code === 'M3';
          return (
            <div key={phase.code} className="relative">
              <button
                type="button"
                disabled={isCurrent}
                onClick={() => {
                  if (!isCurrent) {
                    setLockedTooltip(lockedTooltip === phase.code ? null : phase.code);
                  }
                }}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                  isCurrent
                    ? 'bg-anac-blue/10 text-anac-blue font-semibold'
                    : 'text-anac-muted/60 hover:bg-anac-gray cursor-pointer'
                }`}
              >
                {isCurrent ? (
                  <Circle size={12} className="text-anac-blue fill-anac-blue flex-shrink-0" />
                ) : (
                  <Lock size={11} className="flex-shrink-0 opacity-40" />
                )}
                <span>{phase.label}</span>
              </button>

              {lockedTooltip === phase.code && (
                <div className="absolute left-0 top-full mt-1 z-10 bg-anac-navy text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                  Phase non encore ouverte
                  <button
                    className="ml-2 opacity-60 hover:opacity-100"
                    onClick={() => setLockedTooltip(null)}
                  >
                    x
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card p-4 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-anac-muted mb-3">
          Checklist - Phase Preliminaire
        </p>
        <div className="space-y-2">
          {checklist.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              {item.done ? (
                <CheckCircle size={13} className="text-anac-success flex-shrink-0 mt-0.5" />
              ) : item.optional ? (
                <CircleDashed size={13} className="text-anac-muted/50 flex-shrink-0 mt-0.5" />
              ) : (
                <Circle size={13} className="text-anac-muted/40 flex-shrink-0 mt-0.5" />
              )}
              <span
                className={`text-xs leading-tight ${
                  item.done
                    ? 'text-anac-navy line-through decoration-anac-muted/40'
                    : item.optional
                      ? 'text-anac-muted/60 italic'
                      : 'text-anac-navy'
                }`}
              >
                {item.label}
                {item.optional && (
                  <span className="ml-1 text-[9px] text-anac-muted/50 not-italic font-medium uppercase tracking-wide">
                    facultatif
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
