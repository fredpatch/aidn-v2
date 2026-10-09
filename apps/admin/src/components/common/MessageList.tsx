import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { DayGroup } from '../../lib/dayGroups';
import { cn } from '../../lib/utils';

type ItemId = number | string;

/**
 * C2a - Message-list column shared by the two-pane pages (Demandes,
 * Courriers): rows grouped under day headers, one selected row
 * (aria-selected) and roving focus. The keyboard handler is scoped to the
 * list: ↑/↓, Début/Fin move the selection, Entrée calls `onActivate`.
 *
 * Business rule kept by every caller: `onActivate` never changes a state by
 * itself; an action that does (open a phase, put a courrier in signature)
 * only gets the focus, and the user confirms.
 *
 * Loading, error and empty states stay with the caller (their copy is
 * domain-specific); this component renders only a non-empty list.
 */
export function MessageList<T>({
  groups,
  getId,
  selectedId,
  ariaLabel,
  onSelect,
  onActivate,
  renderRow,
}: {
  groups: DayGroup<T>[];
  getId: (item: T) => ItemId;
  selectedId: ItemId | null;
  ariaLabel: string;
  onSelect: (item: T) => void;
  onActivate: (item: T) => void;
  renderRow: (item: T) => ReactNode;
}) {
  const rowRefs = useRef(new Map<ItemId, HTMLDivElement>());
  const flat = groups.flatMap((group) => group.items);
  const focusableId = flat.some((item) => getId(item) === selectedId)
    ? selectedId
    : flat[0] !== undefined
      ? getId(flat[0])
      : null;

  function moveTo(item: T | undefined) {
    if (item === undefined) return;
    onSelect(item);
    rowRefs.current.get(getId(item))?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = flat.findIndex((item) => getId(item) === focusableId);
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
      if (current !== undefined) {
        event.preventDefault();
        onActivate(current);
      }
    }
  }

  return (
    <div role="listbox" aria-label={ariaLabel} onKeyDown={handleKeyDown}>
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
            const id = getId(item);
            const selected = id === selectedId;
            return (
              <div
                key={id}
                ref={(node) => {
                  if (node) rowRefs.current.set(id, node);
                  else rowRefs.current.delete(id);
                }}
                role="option"
                aria-selected={selected}
                tabIndex={id === focusableId ? 0 : -1}
                onClick={() => onSelect(item)}
                className={cn(
                  'relative grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-anac-border/70 py-2.5 pl-4 pr-3.5 text-left outline-none transition-colors hover:bg-anac-blue/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-anac-sky',
                  selected &&
                    'bg-anac-blue/10 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-anac-blue hover:bg-anac-blue/10'
                )}
              >
                {renderRow(item)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
