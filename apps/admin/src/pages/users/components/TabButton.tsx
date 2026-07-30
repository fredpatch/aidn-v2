import type { ReactNode } from 'react';

export function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-2 pb-2 pt-1 text-xs font-medium ${
        active
          ? 'border-anac-blue text-anac-blue'
          : 'border-transparent text-anac-muted hover:text-anac-navy'
      }`}
    >
      {children}
      {count !== undefined && (
        <span className="rounded-full bg-anac-blue/10 px-2 py-0.5 text-xs text-anac-blue">
          {count}
        </span>
      )}
    </button>
  );
}
