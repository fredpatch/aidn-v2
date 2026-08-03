import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils';

export function AnalyticsSection({
  title,
  subtitle,
  className,
  children,
}: {
  title?: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('rounded-lg border border-anac-border bg-white shadow-sm', className)}>
      {title ? (
        <div className="border-b border-anac-border px-4 py-3">
          <h2 className="text-sm font-semibold text-anac-navy">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[11px] text-anac-muted">{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
