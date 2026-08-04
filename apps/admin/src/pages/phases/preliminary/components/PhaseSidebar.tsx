import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Circle, CircleDashed, Clock3 } from 'lucide-react';
import { PHASE_ROADMAP } from '../constants';
import { buildChecklist } from '../helpers';
import { fetchPhasesSummary } from '../../../../lib/api/phases.api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';
import type { ChecklistItem, PreliminaryBundle } from '../types';

interface PhaseSidebarProps {
  bundle: PreliminaryBundle | null;
  requestId?: string;
  currentCode?: string;
  checklistTitle?: string;
  checklist?: ChecklistItem[];
}

export default function PhaseSidebar({
  bundle,
  requestId,
  currentCode = 'M3',
  checklistTitle,
  checklist: externalChecklist,
}: PhaseSidebarProps) {
  const navigate = useNavigate();

  // Per-phase real status (done / open / not-started yet) - without this,
  // every non-current phase looked identical whether it was already closed
  // or had never been opened, and none of them actually navigated anywhere.
  // See project/hardening-plan.md workstream A.
  const { data: summary } = useQuery({
    queryKey: requestId ? queryKeys.phases.summary(requestId) : queryKeys.phases.all,
    queryFn: () => fetchPhasesSummary(requestId!),
    enabled: !!requestId,
  });

  const checklist = externalChecklist ?? (bundle ? buildChecklist(bundle) : []);
  const title =
    checklistTitle ??
    `Checklist - ${PHASE_ROADMAP.find((p) => p.code === currentCode)?.label ?? currentCode}`;

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-anac-muted mb-3">
          Phases du dossier
        </p>
        {PHASE_ROADMAP.map((phase) => {
          const isCurrent = phase.code === currentCode;
          const phaseStatus = summary?.find((s) => s.phaseCode === phase.code)?.status;
          const isClosed = phaseStatus === 'closed';
          const isOpen = phaseStatus === 'open';

          function handleClick() {
            if (isCurrent) return;
            if (requestId) {
              navigate(`/demandes/${requestId}/${phase.path}`);
            }
          }

          return (
            <div key={phase.code} className="relative">
              <button
                type="button"
                disabled={isCurrent}
                onClick={handleClick}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                  isCurrent
                    ? 'bg-anac-blue/10 text-anac-blue font-semibold'
                    : isClosed
                      ? 'text-anac-navy hover:bg-anac-gray cursor-pointer'
                      : isOpen
                        ? 'text-anac-navy hover:bg-anac-gray cursor-pointer'
                        : 'text-anac-muted hover:bg-anac-gray cursor-pointer'
                }`}
                title={
                  isCurrent
                    ? undefined
                    : phaseStatus
                      ? 'Consulter cette phase'
                      : 'Consulter cette phase et la demarrer si les conditions sont remplies'
                }
              >
                {isCurrent ? (
                  <Circle size={12} className="text-anac-blue fill-anac-blue flex-shrink-0" />
                ) : isClosed ? (
                  <CheckCircle size={12} className="text-anac-success flex-shrink-0" />
                ) : isOpen ? (
                  <Clock3 size={12} className="text-anac-warning flex-shrink-0" />
                ) : (
                  <CircleDashed size={12} className="flex-shrink-0 opacity-60" />
                )}
                <span>{phase.label}</span>
              </button>
            </div>
          );
        })}
      </div>

      {checklist.length > 0 && (
        <div className="card p-4 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-anac-muted mb-3">
            {title}
          </p>
          <div className="space-y-2">
            {checklist.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                {item.done ? (
                  <CheckCircle size={14} className="text-anac-success flex-shrink-0 mt-0.5" />
                ) : item.optional ? (
                  <CircleDashed size={14} className="text-anac-muted/50 flex-shrink-0 mt-0.5" />
                ) : (
                  <Circle size={14} className="text-anac-muted/40 flex-shrink-0 mt-0.5" />
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
      )}
    </div>
  );
}
