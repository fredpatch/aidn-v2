import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { AgingBadge } from '../../components/cockpit/AgingBadge';
import type { CourrierTask } from '../../lib/api/courrier-tasks';
import { formatRowDate } from '../../lib/dayGroups';
import { cn } from '../../lib/utils';
import { SOURCE_LABELS, STEP_LABELS, courrierRowLabel } from './courrierCopy';

/** One list row: organisation and date, reference and source, badges, then
 *  the step and its next action. */
export function CourrierRow({ task }: { task: CourrierTask }) {
  return (
    <>
      <span className="truncate text-sm font-medium text-anac-text">{task.organisationName}</span>
      <span className="whitespace-nowrap text-right text-[11px] text-anac-muted">{task.stepSince ? formatRowDate(task.stepSince) : '-'}</span>
      <span className="truncate text-xs text-anac-text/80">{task.requestReference} · {SOURCE_LABELS[task.source] ?? task.source}</span>
      <span className="flex justify-end gap-1.5">
        {task.dossierClosed ? <ClosedDossierBadge status={task.dossierStatus} /> : null}
        {task.bucket === 'to_print' || task.bucket === 'with_dg' ? (
          <AgingBadge urgency={task.urgency} since={task.stepSince} workingDays={task.bucket === 'with_dg' ? task.signatureWorkingDays : null} />
        ) : null}
      </span>
      <span className="col-span-2 truncate text-xs">
        <span className="text-anac-muted">{STEP_LABELS[task.circuitStep]} - </span>
        <span className={cn('font-semibold', task.state === 'action_required' ? 'text-anac-blue' : task.state === 'waiting' ? 'text-anac-warning' : 'text-anac-muted')}>
          {courrierRowLabel(task)}
        </span>
      </span>
    </>
  );
}
