import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal chrome, same API as the admin app's Modal plus the focus handling it
 * lacks: focus moves into the dialog on open (initialFocusRef or first
 * control), Tab cycles inside it, Escape / backdrop / close button call
 * onClose, and focus returns to the element that opened it.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  className,
  initialFocusRef,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  initialFocusRef?: React.RefObject<HTMLElement>;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    (initialFocusRef?.current ?? panel?.querySelector<HTMLElement>(FOCUSABLE))?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      opener?.focus?.();
    };
    // Runs once per opening: the dialog owns focus for its whole lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleOverlayClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-anac-navy/40 p-4" onClick={handleOverlayClick}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('w-full max-w-md rounded-lg border border-anac-border bg-white p-5 shadow-xl', className)}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-anac-navy">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-anac-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded text-anac-muted hover:bg-anac-gray hover:text-anac-navy"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
        {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
