import type { ReactNode } from 'react';
import { AlertCircle, Ban, CheckCircle2, Clock3, Info, type LucideIcon } from 'lucide-react';
import type { NextActionOwner, OperationalState } from '@aidn/shared';
import { cn } from '../../lib/utils';

export interface OperationalCalloutProps {
  state: OperationalState;
  title: string;
  description: string;
  owner?: NextActionOwner | null;
  canAct: boolean;
  cta?: ReactNode;
  /** Navigation-only link, rendered whatever `canAct` is. */
  secondary?: ReactNode;
  blockReason?: string | null;
  compact?: boolean;
}

const STYLES: Record<OperationalState, { box: string; icon: LucideIcon; iconClass: string }> = {
  action_required: { box: 'border-anac-warning/40 bg-anac-warning/5', icon: AlertCircle, iconClass: 'text-anac-warning' },
  waiting: { box: 'border-anac-info/30 bg-anac-info/5', icon: Clock3, iconClass: 'text-anac-info' },
  information: { box: 'border-anac-border bg-white', icon: Info, iconClass: 'text-anac-navy' },
  done: { box: 'border-anac-success/30 bg-anac-success/5', icon: CheckCircle2, iconClass: 'text-anac-success' },
  blocked: { box: 'border-anac-danger/30 bg-anac-danger/5', icon: Ban, iconClass: 'text-anac-danger' },
};

export function OperationalCallout({
  state,
  title,
  description,
  owner,
  canAct,
  cta,
  secondary,
  blockReason,
  compact,
}: OperationalCalloutProps) {
  const { box, icon: Icon, iconClass } = STYLES[state];
  // Spec §7.1: `waiting` always names who is awaited, whatever canAct (an SU
  // may act for anyone but the dossier still waits on that owner).
  const othersTurn = state === 'action_required' && !!owner && !canAct;
  const waitingOn = state === 'waiting' && !!owner;
  const eyebrow =
    othersTurn || waitingOn
      ? `En attente de : ${owner!.label}`
      : state === 'action_required'
        ? 'Action requise'
        : state === 'done'
          ? 'Terminé'
          : state === 'blocked'
            ? 'Bloqué'
            : 'Information';
  return (
    <section role="status" className={cn('rounded-lg border', compact ? 'p-3' : 'p-4', box)}>
      <div className="flex items-start gap-3">
        <Icon size={18} className={cn('mt-0.5 flex-shrink-0', iconClass)} aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className={cn('text-xs font-semibold', iconClass)}>{eyebrow}</p>
          <p className="text-sm font-semibold text-anac-navy">{title}</p>
          <p className="text-sm text-anac-text">{description}</p>
          {owner && (
            <p className="text-sm text-anac-text">
              Responsable : <span className="font-semibold">{owner.label}</span>
            </p>
          )}
          {othersTurn && (
            <p className="text-sm text-anac-text">Aucune action de votre part : {owner!.label} doit agir.</p>
          )}
          {/* Helpers attach block reasons to non-blocked states (M3-M7 closure gates). */}
          {blockReason && state !== 'done' && (
            <p
              className={cn(
                'text-sm font-medium',
                state === 'blocked' ? 'text-anac-danger' : 'text-anac-warning'
              )}
            >
              {blockReason}
            </p>
          )}
          {(canAct && cta) || secondary ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {canAct && cta}
              {secondary}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
