import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils';

interface DashboardSectionProps {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function DashboardSection({
  children,
  className,
  title,
  description,
  action,
}: DashboardSectionProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)]',
        className
      )}
    >
      {title || description || action ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-sm font-semibold text-anac-navy">{title}</h2> : null}
            {description ? <p className="text-[12px] text-anac-muted">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
