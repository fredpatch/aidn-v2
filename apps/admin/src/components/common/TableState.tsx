import type { ElementType, ReactNode } from 'react';
import { cn } from '../../lib/utils';

type TableStateKind = 'loading' | 'empty' | 'error';

export function TableState({
  state,
  title,
  description,
  icon,
  action,
  className,
}: {
  state: TableStateKind;
  title: string;
  description?: string;
  icon?: ElementType;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = icon;

  return (
    <div
      className={cn('grid min-h-[260px] place-items-center px-4 py-8 text-center', className)}
    >
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
            state === 'error' ? 'text-anac-danger' : 'text-anac-navy'
          )}
        >
          {title}
        </p>
        {description ? (
          <p
            className={cn(
              'mt-1 text-sm text-anac-muted',
              Icon ? 'mx-auto max-w-sm text-xs' : undefined
            )}
          >
            {description}
          </p>
        ) : null}
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
