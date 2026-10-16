import type { OperationalUrgency } from '@aidn/shared';
import { cn } from '../../lib/utils';

const DAY_MS = 86_400_000;

/** §6 - one aging treatment. overdue: « En retard · J+n »; warning:
 *  « Échéance proche »; normal: « depuis n j » / « dans n j ». n counts
 *  working days when `workingDays` is given (« j ouvrés »). No date: nothing. */
export function AgingBadge({
  urgency,
  since,
  dueAt = null,
  workingDays = null,
  now = new Date(),
}: {
  urgency: OperationalUrgency;
  since: string | null;
  dueAt?: string | null;
  workingDays?: number | null;
  now?: Date;
}) {
  const unit = workingDays !== null ? 'j ouvrés' : 'j';
  const elapsed = (iso: string) => Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const calendarDaysOverdue = (iso: string) =>
    Math.max(0, Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS));
  if (urgency === 'overdue') {
    const n = dueAt ? calendarDaysOverdue(dueAt) : workingDays ?? (since ? elapsed(since) : null);
    return <Badge tone="overdue">{n === null ? 'En retard' : `En retard · J+${n}`}</Badge>;
  }
  if (urgency === 'warning') return <Badge tone="warning">Échéance proche</Badge>;
  if (dueAt && new Date(dueAt).getTime() > now.getTime()) {
    return <Badge tone="normal">{`dans ${Math.ceil((new Date(dueAt).getTime() - now.getTime()) / DAY_MS)} j`}</Badge>;
  }
  const n = workingDays ?? (since ? elapsed(since) : null);
  if (n === null) return null;
  return <Badge tone="normal">{`depuis ${n} ${unit}`}</Badge>;
}

function Badge({ tone, children }: { tone: OperationalUrgency; children: string }) {
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-full px-1.5 text-[10px] font-semibold leading-4',
        tone === 'overdue' && 'border border-red-200 bg-red-50 text-anac-danger',
        tone === 'warning' && 'border border-orange-200 bg-orange-50 text-anac-warning',
        tone === 'normal' && 'text-anac-muted'
      )}
    >
      {children}
    </span>
  );
}
