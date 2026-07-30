import type { SelectHTMLAttributes } from 'react';

export function FilterSelect({
  label,
  children,
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; className?: string }) {
  return (
    <label
      className={`flex h-11 items-center gap-2 rounded-lg border border-anac-border bg-white px-3 text-sm text-anac-muted ${className}`}
    >
      <span className="shrink-0 text-xs">{label}</span>
      <select {...props} className="min-w-0 flex-1 bg-transparent text-anac-navy outline-none">
        {children}
      </select>
    </label>
  );
}
