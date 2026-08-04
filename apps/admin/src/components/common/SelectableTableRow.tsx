import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { TableRow } from '../ui/table';
import { cn } from '../../lib/utils';

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('a, button, input, select, textarea, [role="button"]'))
  );
}

export function SelectableTableRow({
  selected,
  onSelect,
  children,
  className,
  ariaLabel,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
  ariaLabel: string;
  className?: string;
}) {
  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    if (isInteractiveTarget(event.target)) return;
    onSelect();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (isInteractiveTarget(event.target)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect();
  }

  return (
    <TableRow
      tabIndex={0}
      aria-label={ariaLabel}
      aria-selected={selected}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky',
        selected && 'bg-anac-blue/5 outline outline-1 -outline-offset-1 outline-anac-blue',
        className
      )}
    >
      {children}
    </TableRow>
  );
}
