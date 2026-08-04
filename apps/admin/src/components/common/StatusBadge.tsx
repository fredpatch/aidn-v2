import type { ElementType } from 'react';
import { cn } from '../../lib/utils';

/**
 * Presentational status badge shell, shared across cockpit pages.
 *
 * `tone` is a precomputed Tailwind class string (e.g. "border-green-100
 * bg-green-50 text-anac-success") — the status -> tone mapping is domain
 * logic and stays in each feature file, not here.
 *
 * `pill` (default true) selects the two shapes found across the app:
 *  - pill: rounded-full, 11px text, no icon (Requests, Meetings, Account
 *    Requests, Inspections)
 *  - tag: rounded, 12px text, optional icon (Courrier, S5 Payments)
 */
export function StatusBadge({
  label,
  tone,
  icon: Icon,
  pill = true,
  className,
}: {
  label: string;
  tone: string;
  icon?: ElementType;
  pill?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 border font-semibold',
        pill ? 'rounded-full px-2 py-0.5 text-[11px]' : 'rounded px-2 py-0.5 text-xs',
        tone,
        className
      )}
    >
      {Icon ? <Icon size={12} aria-hidden="true" /> : null}
      {label}
    </span>
  );
}
