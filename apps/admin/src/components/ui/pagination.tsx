import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/utils';

export function Pagination({
  label,
  page,
  totalPages,
  onPageChange,
  className,
}: {
  label?: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1 && !label) return null;

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-t border-anac-border px-4 py-3', className)}>
      {label ? <p className="text-xs text-anac-muted">{label}</p> : <span />}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Page precedente"
          title="Page precedente"
          className="h-8 w-8 px-0"
        >
          <ChevronLeft size={14} />
        </Button>
        <span className="rounded-lg bg-anac-blue px-3 py-1.5 text-xs font-semibold text-white">{page}</span>
        <span className="text-xs text-anac-muted">/ {Math.max(totalPages, 1)}</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Page suivante"
          title="Page suivante"
          className="h-8 w-8 px-0"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

/**
 * Clamp a page number and slice an array to it. Client-side pagination helper
 * for list/cockpit pages that don't have server-side limit/offset support yet.
 */
export function paginate<T>(items: T[], page: number, pageSize: number): { pageItems: T[]; totalPages: number; page: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { pageItems: items.slice(start, start + pageSize), totalPages, page: safePage };
}
