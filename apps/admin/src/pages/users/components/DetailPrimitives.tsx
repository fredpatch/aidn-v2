import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function DetailSection({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-anac-border bg-white p-2.5 ${className}`}>
      <h2 className="text-[13px] font-semibold text-anac-navy">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function InfoRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-2 py-1 text-sm">
      <span className="text-anac-muted">{label}</span>
      <span className={strong ? 'font-semibold text-anac-navy' : 'text-anac-text'}>{value}</span>
    </div>
  );
}

export function CompactStat({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="border-b border-anac-border/70 py-1.5 last:border-0">
      <p className="text-[11px] font-medium text-anac-muted">{label}</p>
      <p
        className={`mt-0.5 text-[13px] ${
          strong ? 'font-semibold text-anac-navy' : 'text-anac-text'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function TimelineItem({
  icon: Icon,
  title,
  meta,
}: {
  icon: LucideIcon;
  title: string;
  meta: string;
}) {
  return (
    <div className="flex gap-2 py-1">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-anac-blue/10 text-anac-blue">
        <Icon size={14} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium leading-snug text-anac-navy">{title}</span>
        <span className="text-[10px] text-anac-muted">{meta}</span>
      </span>
    </div>
  );
}
