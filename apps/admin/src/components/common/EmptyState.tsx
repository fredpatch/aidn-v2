import type { ElementType } from 'react';
import { cn } from '../../lib/utils';

/**
 * Shared empty-state block for cockpit lists/panels.
 *
 * `icon` is optional — when provided, renders the icon-badge variant
 * (Courrier, S5 Payments) with a smaller title/description. Without it,
 * renders the plain variant (Requests, Meetings, Account Requests,
 * Inspections).
 *
 * `className` lets each call site override min-height/padding to match its
 * layout instead of baking one fixed size in here.
 */
export function EmptyState({
  title,
  description,
  danger = false,
  icon: Icon,
  className,
}: {
  title: string;
  description?: string;
  danger?: boolean;
  icon?: ElementType;
  className?: string;
}) {
  return (
    <div className={cn('grid min-h-[260px] place-items-center px-4 py-8 text-center', className)}>
      <div>
        {Icon ? (
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-lg border border-anac-border bg-white text-anac-muted">
            <Icon size={16} aria-hidden="true" />
          </div>
        ) : null}
        <p
          className={cn(
            'font-semibold',
            Icon ? 'text-sm' : undefined,
            danger ? 'text-anac-danger' : 'text-anac-navy'
          )}
        >
          {title}
        </p>
        {description ? (
          <p className={cn('mt-1 text-sm text-anac-muted', Icon ? 'mx-auto max-w-sm text-xs' : undefined)}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
