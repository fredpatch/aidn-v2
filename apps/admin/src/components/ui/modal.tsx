import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared modal chrome: overlay, escape-to-close, backdrop-click-to-close,
 * and a consistent title/subtitle/close-button header.
 *
 * Body content goes in `children`; the action row (Annuler + submit, etc.)
 * goes in `footer` - each page keeps its own form fields and buttons, this
 * component only owns the mechanics.
 *
 * Focus handling (aligned on the portal Modal): on open, focus goes to
 * `initialFocusRef`, else stays on a field that already took it
 * (`autoFocus`), else the first control; Tab / Shift+Tab cycle inside the
 * dialog; on close, focus returns to the element that opened it.
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
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  initialFocusRef?: RefObject<HTMLElement>;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Captured during the first render, before any `autoFocus` child moves
  // focus inside the dialog at commit time.
  const openerRef = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)
  );

  useEffect(() => {
    const opener = openerRef.current;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      (initialFocusRef?.current ?? panel.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    } else if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    }

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
      // Focus may have fallen to <body> (e.g. the focused button got disabled
      // while submitting): bring it back into the dialog.
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (opener?.isConnected) opener.focus();
    };
    // Runs once per opening: the dialog owns focus for its whole lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleOverlayClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-anac-navy/40 p-4"
      onClick={handleOverlayClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'w-full max-w-md rounded-lg border border-anac-border bg-white p-5 shadow-xl',
          className
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-anac-navy">
              {title}
            </h2>
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
