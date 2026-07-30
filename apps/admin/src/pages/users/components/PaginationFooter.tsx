import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../../components/ui/button';

export function PaginationFooter({
  label,
  page,
  totalPages,
  onPageChange,
}: {
  label: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-anac-border px-4 py-3">
      <p className="text-xs text-anac-muted">{label}</p>
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
        <span className="rounded-lg bg-anac-blue px-3 py-1.5 text-xs font-semibold text-white">
          {page}
        </span>
        <span className="text-xs text-anac-muted">/ {totalPages}</span>
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
