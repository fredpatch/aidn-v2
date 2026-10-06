import { CheckCircle2, Circle, Clock3 } from 'lucide-react';

export type StepState = 'done' | 'current' | 'waiting';

export function stepState(done: boolean, current: boolean): StepState {
  if (done) return 'done';
  if (current) return 'current';
  return 'waiting';
}

const STATE_STYLES: Record<StepState, { icon: typeof CheckCircle2; tone: string; srLabel: string }> = {
  done: { icon: CheckCircle2, tone: 'border-anac-success/30 text-anac-success', srLabel: 'Terminé' },
  current: { icon: Clock3, tone: 'border-anac-warning/40 text-anac-warning', srLabel: 'En cours' },
  waiting: { icon: Circle, tone: 'border-anac-border text-anac-muted', srLabel: 'À venir' },
};

/** One step of a phase summary (e.g. Réunion / Déclaration / Suite du dossier). */
export function PhaseStep({ label, detail, state }: { label: string; detail: string; state: StepState }) {
  const { icon: Icon, tone, srLabel } = STATE_STYLES[state];

  return (
    <div className={`rounded border bg-white p-3 ${tone}`}>
      <div className="flex items-center gap-2">
        <Icon size={15} aria-hidden="true" />
        <p className="text-xs font-semibold text-anac-navy">
          {label}
          <span className="sr-only"> ({srLabel})</span>
        </p>
      </div>
      <p className="mt-1 text-xs text-anac-muted">{detail}</p>
    </div>
  );
}
