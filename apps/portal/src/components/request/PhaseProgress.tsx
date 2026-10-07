import { AlertTriangle, Ban, Check, Circle, Clock3 } from 'lucide-react';
import type { PhaseProgressItem } from '../../pages/requests/progress';

type StripState = 'done' | 'current' | 'upcoming' | 'error' | 'interrupted';

const STATE_STYLES: Record<StripState, { bar: string; text: string; icon: typeof Check; label: string }> = {
  done: { bar: 'bg-anac-success', text: 'text-anac-success', icon: Check, label: 'Terminée' },
  current: { bar: 'bg-anac-warning', text: 'text-anac-warning', icon: Clock3, label: 'En cours' },
  upcoming: { bar: 'bg-anac-border', text: 'text-anac-muted', icon: Circle, label: 'À venir' },
  error: { bar: 'bg-anac-danger', text: 'text-anac-danger', icon: AlertTriangle, label: 'Indisponible' },
  interrupted: { bar: 'bg-anac-danger', text: 'text-anac-danger', icon: Ban, label: 'Interrompue' },
};

function stripState(item: PhaseProgressItem): StripState {
  switch (item.stage) {
    case 'closed':
      return 'done';
    case 'current':
      return 'current';
    case 'error':
      return 'error';
    case 'interrupted':
      return 'interrupted';
    default:
      return 'upcoming';
  }
}

/** Horizontal strip: Dépôt + the five phases. Wraps to 3 columns on mobile. */
export function PhaseProgress({ items, intakeDone }: { items: PhaseProgressItem[]; intakeDone: boolean }) {
  const steps: Array<{ key: string; label: string; state: StripState }> = [
    { key: 'intake', label: 'Dépôt', state: intakeDone ? 'done' : 'current' },
    ...items.map((item) => ({ key: item.code, label: item.shortLabel, state: stripState(item) })),
  ];

  return (
    <ol aria-label="Avancement du dossier" className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6">
      {steps.map((step) => {
        const style = STATE_STYLES[step.state];
        const Icon = style.icon;
        return (
          <li key={step.key} aria-current={step.state === 'current' ? 'step' : undefined}>
            <div className={`h-1 rounded-full ${style.bar}`} />
            <p className="mt-1.5 truncate text-xs font-semibold text-anac-navy">{step.label}</p>
            <p className={`flex items-center gap-1 text-[11px] ${style.text}`}>
              <Icon size={12} aria-hidden="true" />
              {style.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
