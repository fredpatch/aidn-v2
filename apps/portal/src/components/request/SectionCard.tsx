import type { ElementType, ReactNode } from 'react';

/** White detail card with an icon + title header, used inside every phase section. */
export function SectionCard({
  icon: Icon,
  title,
  aside,
  iconClassName,
  className = 'border-anac-border',
  children,
}: {
  icon: ElementType;
  title: ReactNode;
  /** Optional element on the right of the header (e.g. a counter badge). */
  aside?: ReactNode;
  iconClassName?: string;
  /** Border override, e.g. 'border-anac-warning/40'. */
  className?: string;
  children: ReactNode;
}) {
  const header = (
    <div className="flex items-center gap-2 text-anac-navy">
      <Icon size={16} className={iconClassName} aria-hidden="true" />
      <p className="text-sm font-semibold">{title}</p>
    </div>
  );

  return (
    <div className={`rounded-lg border bg-white p-4 ${className}`}>
      {aside ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {header}
          {aside}
        </div>
      ) : (
        header
      )}
      {children}
    </div>
  );
}
