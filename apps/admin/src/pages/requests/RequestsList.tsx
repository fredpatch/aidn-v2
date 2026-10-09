import { useRef, type KeyboardEvent } from 'react';
import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { EmptyState } from '../../components/common/EmptyState';
import type { RequestCockpitItem } from '../../lib/api/requests.types';
import { cn } from '../../lib/utils';
import { formatRowDate, isClosedRequest, type RequestDayGroup } from './requestBuckets';

const NEXT_ACTION_TEXT: Record<RequestCockpitItem['nextActionTone'], string> = {
  info: 'text-anac-blue',
  warning: 'text-anac-warning',
  success: 'text-anac-success',
  danger: 'text-anac-danger',
};

/**
 * D1 - Message-list style column: rows grouped by submission day, one
 * selected row (aria-selected) and roving focus. The keyboard handler is
 * scoped to the list: ↑/↓, Début/Fin move the selection, Entrée activates.
 */
export function RequestsList({
  groups,
  selectedId,
  loading,
  error,
  onSelect,
  onActivate,
}: {
  groups: RequestDayGroup[];
  selectedId: number | null;
  loading: boolean;
  error: boolean;
  onSelect: (item: RequestCockpitItem) => void;
  onActivate: (item: RequestCockpitItem) => void;
}) {
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const flat = groups.flatMap((group) => group.items);
  const focusableId = flat.some((item) => item.id === selectedId)
    ? selectedId
    : (flat[0]?.id ?? null);

  if (loading) {
    return (
      <EmptyState title="Chargement des demandes" description="Récupération du cockpit dossiers." />
    );
  }
  if (error) {
    return (
      <EmptyState
        title="Chargement impossible"
        description="Impossible de charger les demandes."
        danger
      />
    );
  }
  if (flat.length === 0) {
    return (
      <EmptyState
        title="Aucune demande dans cette vue"
        description="Modifiez la recherche ou l'onglet."
      />
    );
  }

  function moveTo(item: RequestCockpitItem | undefined) {
    if (!item) return;
    onSelect(item);
    rowRefs.current.get(item.id)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = flat.findIndex((item) => item.id === focusableId);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveTo(flat[Math.min(index + 1, flat.length - 1)]);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveTo(flat[Math.max(index - 1, 0)]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveTo(flat[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      moveTo(flat[flat.length - 1]);
    } else if (event.key === 'Enter') {
      const current = flat[index];
      if (current) {
        event.preventDefault();
        onActivate(current);
      }
    }
  }

  return (
    <div role="listbox" aria-label="Demandes" onKeyDown={handleKeyDown}>
      {groups.map((group) => (
        <div key={group.key} role="group" aria-label={group.label ?? undefined}>
          {group.label ? (
            <div
              aria-hidden="true"
              className="border-b border-anac-border bg-anac-gray/70 px-4 py-1.5 text-[11px] font-semibold text-anac-text/80"
            >
              {group.label}{' '}
              <span className="font-medium text-anac-muted">({group.items.length})</span>
            </div>
          ) : null}
          {group.items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <div
                key={item.id}
                ref={(node) => {
                  if (node) rowRefs.current.set(item.id, node);
                  else rowRefs.current.delete(item.id);
                }}
                role="option"
                aria-selected={selected}
                tabIndex={item.id === focusableId ? 0 : -1}
                onClick={() => onSelect(item)}
                className={cn(
                  'relative grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-anac-border/70 py-2.5 pl-4 pr-3.5 text-left outline-none transition-colors hover:bg-anac-blue/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-anac-sky',
                  selected &&
                    'bg-anac-blue/10 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-anac-blue hover:bg-anac-blue/10'
                )}
              >
                <span className="truncate text-sm font-medium text-anac-text">
                  {item.organisationName}
                </span>
                <span className="whitespace-nowrap text-right text-[11px] text-anac-muted">
                  {formatRowDate(item.createdAt)}
                </span>
                <span className="truncate text-xs text-anac-text/80">
                  {item.reference} · {item.requestTypeLabel}
                </span>
                <span className="flex justify-end">
                  {isClosedRequest(item) ? <ClosedDossierBadge status={item.status} /> : null}
                </span>
                <span className="col-span-2 truncate text-xs">
                  <span className="text-anac-muted">{item.currentPhaseLabel} — </span>
                  <span className={cn('font-semibold', NEXT_ACTION_TEXT[item.nextActionTone])}>
                    {item.nextActionLabel}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
