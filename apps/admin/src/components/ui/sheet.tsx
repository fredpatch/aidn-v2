import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

/** Longest exit transition below - the sheet unmounts once it has elapsed. */
const EXIT_DURATION_MS = 200;

type SheetState = 'open' | 'closed';

const SheetStateContext = React.createContext<SheetState>('open');

/**
 * Side drawer with enter/exit transitions.
 *
 * The sheet stays mounted while it slides out, and keeps rendering the
 * children it had while open - so callers can clear their state on close
 * (e.g. `{item && <Details item={item} />}`) without the panel emptying
 * mid-animation.
 */
export function Sheet({ open, onOpenChange, children }: SheetProps) {
  const [mounted, setMounted] = React.useState(open);
  const [state, setState] = React.useState<SheetState>('closed');
  const lastOpenChildren = React.useRef(children);
  if (open) lastOpenChildren.current = children;

  React.useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames so the closed styles are painted before switching to
      // open - otherwise the browser skips straight to the end state.
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setState('open'));
      });
      return () => cancelAnimationFrame(frame);
    }

    setState('closed');
    const timer = window.setTimeout(() => setMounted(false), EXIT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  const onOpenChangeRef = React.useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  React.useEffect(() => {
    if (!mounted) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChangeRef.current(false);
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', onKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus?.();
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <SheetStateContext.Provider value={state}>
      <div className="fixed inset-0 z-50" data-state={state}>
        <button
          type="button"
          aria-label="Fermer le panneau"
          tabIndex={-1}
          data-state={state}
          className={cn(
            'absolute inset-0 bg-anac-navy/25 transition-opacity',
            'data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
            'data-[state=open]:duration-[240ms] data-[state=closed]:duration-200',
            'data-[state=open]:ease-out data-[state=closed]:ease-in'
          )}
          onClick={() => onOpenChange(false)}
        />
        {open ? children : lastOpenChildren.current}
      </div>
    </SheetStateContext.Provider>
  );
}

export function SheetContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const state = React.useContext(SheetStateContext);
  const panelRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (state === 'open' && !panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus({ preventScroll: true });
    }
  }, [state]);

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      data-state={state}
      className={cn(
        'absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col overflow-hidden border-l border-anac-border bg-white outline-none',
        'shadow-[-16px_0_40px_-16px_rgba(27,42,94,0.28)]',
        'transition-[transform,opacity] will-change-transform',
        // Enter: long decelerating slide. Exit: shorter, accelerating away.
        'data-[state=open]:translate-x-0 data-[state=open]:duration-[320ms] data-[state=open]:ease-[cubic-bezier(0.22,1,0.36,1)]',
        'data-[state=closed]:translate-x-full data-[state=closed]:duration-200 data-[state=closed]:ease-[cubic-bezier(0.4,0,1,1)]',
        // Reduced motion: no travel, a quick fade instead.
        // (state-qualified so it outranks the data-[state] translate above)
        'motion-reduce:data-[state=closed]:translate-x-0 motion-reduce:data-[state=closed]:opacity-0 motion-reduce:data-[state]:duration-150',
        className
      )}
    >
      {/* Content lands just after the panel starts settling, so text never smears across the slide. */}
      <div
        data-state={state}
        className={cn(
          'flex min-h-0 flex-1 flex-col transition-[opacity,transform]',
          'data-[state=open]:translate-y-0 data-[state=open]:opacity-100 data-[state=open]:delay-[90ms] data-[state=open]:duration-200 data-[state=open]:ease-out',
          'data-[state=closed]:translate-y-1 data-[state=closed]:opacity-0 data-[state=closed]:duration-100',
          'motion-reduce:data-[state=closed]:translate-y-0 motion-reduce:data-[state=open]:delay-0'
        )}
      >
        {children}
      </div>
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
