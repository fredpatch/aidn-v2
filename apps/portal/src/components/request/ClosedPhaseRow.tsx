import { useState, type ReactNode } from 'react';
import { Ban, CheckCircle2, ChevronDown } from 'lucide-react';

/**
 * Collapsed row for a closed phase, or for the phase a rejection interrupted (native <details>: keyboard and screen
 * reader support for free). The section is only mounted once opened.
 */
export function ClosedPhaseRow({
  label,
  summary,
  interrupted = false,
  children,
}: {
  label: string;
  summary: string | null;
  interrupted?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className="group border-t border-anac-border first:border-t-0"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-anac-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky [&::-webkit-details-marker]:hidden">
        {interrupted ? (
          <Ban size={16} className="flex-shrink-0 text-anac-danger" aria-hidden="true" />
        ) : (
          <CheckCircle2 size={16} className="flex-shrink-0 text-anac-success" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-anac-navy">
            {label}
            {interrupted && <span className="ml-2 text-xs font-medium text-anac-danger">Interrompue</span>}
          </span>
          {summary && <span className="block truncate text-xs text-anac-muted">{summary}</span>}
        </span>
        <ChevronDown
          size={16}
          className="flex-shrink-0 text-anac-muted transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      {open && <div className="border-t border-anac-border p-4">{children}</div>}
    </details>
  );
}
