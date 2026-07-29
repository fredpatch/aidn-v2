import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils';

interface EmptyDashboardStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  className?: string;
}

export function EmptyDashboardState({
  title,
  description,
  icon,
  className,
}: EmptyDashboardStateProps) {
  return (
    <div className={cn('rounded-md border border-dashed border-anac-border bg-slate-50 p-4', className)}>
      <div className="flex items-start gap-3">
        {icon ? <div className="mt-0.5 text-anac-blue">{icon}</div> : null}
        <div>
          <p className="text-sm font-medium text-anac-navy">{title}</p>
          <p className="mt-1 text-[12px] text-anac-muted">{description}</p>
        </div>
      </div>
    </div>
  );
}
