import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  React.useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChange(false);
    }

    document.addEventListener('keydown', onKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Fermer le panneau"
        className="absolute inset-0 bg-anac-navy/20 backdrop-blur-[1px]"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </div>
  );
}

export function SheetContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      role="dialog"
      aria-modal="true"
      className={cn(
        'absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col overflow-hidden border-l border-anac-border bg-white shadow-2xl animate-in slide-in-from-right',
        className
      )}
    >
      {children}
    </aside>
  );
}

export function SheetHeader({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-anac-border px-5 py-4">
      <div className="min-w-0">{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClose}
        aria-label="Fermer le panneau"
        title="Fermer"
        className="h-8 w-8 px-0"
      >
        <X size={16} />
      </Button>
    </div>
  );
}

export function SheetBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex-1 overflow-y-auto px-5 py-4', className)}>{children}</div>;
}
