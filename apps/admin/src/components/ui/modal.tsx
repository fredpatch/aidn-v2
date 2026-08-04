import { useEffect, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Shared modal chrome: overlay, escape-to-close, backdrop-click-to-close,
 * and a consistent title/subtitle/close-button header.
 *
 * Body content goes in `children`; the action row (Annuler + submit, etc.)
 * goes in `footer` — each page keeps its own form fields and buttons, this
 * component only owns the mechanics every hand-rolled modal was
 * reimplementing (and in two of three cases, missing entirely).
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  className,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function handleOverlayClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-anac-navy/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={handleOverlayClick}
    >
      <div className={cn('w-full max-w-md rounded-lg border border-anac-border bg-white p-5 shadow-xl', className)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-anac-navy">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-anac-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded text-anac-muted hover:bg-anac-gray hover:text-anac-navy"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
