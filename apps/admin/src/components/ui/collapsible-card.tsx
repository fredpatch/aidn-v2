import { ReactNode, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CollapsibleCardProps {
  title: string;
  icon?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  resetKey?: string | number | boolean;
  className?: string;
}

export default function CollapsibleCard({
  title,
  icon,
  badge,
  children,
  defaultOpen = true,
  resetKey,
  className,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen, resetKey]);

  return (
    <section className={cn('card space-y-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left text-sm font-medium text-anac-navy outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
        >
          {icon}
          <span className="truncate">{title}</span>
          <ChevronDown
            size={16}
            className={cn('shrink-0 text-anac-muted transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
        {badge}
      </div>
      {open && <div className="space-y-4">{children}</div>}
    </section>
  );
}
