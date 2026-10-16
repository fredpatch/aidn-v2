import type { ReactNode } from 'react';
import { EmptyState } from '../common/EmptyState';
import { OperationalCallout, type OperationalCalloutProps } from '../common/OperationalCallout';

const PANE = 'min-w-0 overflow-hidden rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)]';

/** Reading pane: header, then the operational callout (who acts, CTA only
 *  when canAct, secondary navigation always), then the domain body. */
export function QueueReadingPane({
  ariaLabel, header, callout, children,
}: { ariaLabel: string; header: ReactNode; callout: OperationalCalloutProps; children?: ReactNode }) {
  return (
    <article aria-label={ariaLabel} className={PANE}>
      <header className="border-b border-anac-border px-5 pb-3 pt-4">{header}</header>
      <div className="space-y-5 px-5 py-4">
        <OperationalCallout {...callout} />
        {children}
      </div>
    </article>
  );
}

export function QueueEmptyPane({ title, description }: { title: string; description: string }) {
  return (
    <article className={`${PANE} grid min-h-[420px] place-items-center p-6`}>
      <EmptyState title={title} description={description} />
    </article>
  );
}
