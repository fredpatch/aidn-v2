import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { MessageList } from '../../components/common/MessageList';
import type { CourrierTask } from '../../lib/api/courrier-tasks';
import { formatRowDate, type DayGroup } from '../../lib/dayGroups';
import { cn } from '../../lib/utils';
import {
  SOURCE_LABELS,
  STEP_LABELS,
  isSignatureLate,
  nextActionLabel,
  signatureWaitDays,
  stepDateOf,
} from './courrierBuckets';

const NEXT_ACTION_TEXT: Record<CourrierTask['bucket'], string> = {
  to_signature: 'text-anac-blue',
  in_signature: 'text-anac-warning',
  returned: 'text-anac-success',
  legacy_signed: 'text-anac-muted',
};

/**
 * C2b - Courriers column: rows grouped by the day of their current circuit
 * step. Selection and keyboard come from the shared MessageList.
 */
export function CourriersList({
  groups,
  selectedId,
  loading,
  error,
  onSelect,
  onActivate,
}: {
  groups: DayGroup<CourrierTask>[];
  selectedId: string | null;
  loading: boolean;
  error: boolean;
  onSelect: (task: CourrierTask) => void;
  onActivate: (task: CourrierTask) => void;
}) {
  if (loading) {
    return (
      <EmptyState
        title="Chargement des courriers"
        description="Récupération du circuit signature."
      />
    );
  }
  if (error) {
    return (
      <EmptyState
        title="Chargement impossible"
        description="Impossible de charger les courriers."
        danger
      />
    );
  }
  if (groups.every((group) => group.items.length === 0)) {
    return (
      <EmptyState
        title="Aucun courrier dans cette vue"
        description="Modifiez la recherche ou l'onglet."
      />
    );
  }

  return (
    <MessageList
      groups={groups}
      getId={(task) => task.id}
      selectedId={selectedId}
      ariaLabel="Courriers"
      onSelect={onSelect}
      onActivate={onActivate}
      renderRow={(task) => (
        <>
          <span className="truncate text-sm font-medium text-anac-text">
            {task.organisationName}
          </span>
          <span className="whitespace-nowrap text-right text-[11px] text-anac-muted">
            {formatRowDate(stepDateOf(task))}
          </span>
          <span className="truncate text-xs text-anac-text/80">
            {task.requestReference} · {SOURCE_LABELS[task.source] ?? task.source}
          </span>
          <span className="flex justify-end gap-1.5">
            {task.dossierClosed ? <ClosedDossierBadge status={task.dossierStatus} /> : null}
            {isSignatureLate(task) ? (
              <span className="rounded-full border border-orange-200 bg-orange-50 px-1.5 text-[10px] font-semibold leading-4 text-anac-warning">
                J+{signatureWaitDays(task)}
              </span>
            ) : null}
          </span>
          <span className="col-span-2 truncate text-xs">
            <span className="text-anac-muted">{STEP_LABELS[task.bucket]} - </span>
            <span
              className={cn(
                'font-semibold',
                task.dossierClosed ? 'text-anac-muted' : NEXT_ACTION_TEXT[task.bucket]
              )}
            >
              {nextActionLabel(task)}
            </span>
          </span>
        </>
      )}
    />
  );
}
