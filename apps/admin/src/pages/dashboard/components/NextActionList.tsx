import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Eye } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { DashboardActionItem } from '../../../lib/api/dashboard.types';
import { formatDateTime, PRIORITY_STYLES, SLA_STYLES } from '../dashboard.helpers';
import { DashboardSection } from './DashboardSection';

export function NextActionList({ actions }: { actions: DashboardActionItem[] }) {
  return (
    <DashboardSection
      className="p-5"
      title="Prochaines actions requises"
      description="Files DN, signature et paiement a traiter."
      action={
        <Link to="/demandes" className="text-[12px] font-semibold text-anac-blue hover:underline">
          Tout voir
        </Link>
      }
    >
      <div className="mt-4 divide-y divide-anac-border">
        {actions.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-anac-success">
            <CheckCircle2 size={16} aria-hidden="true" />
            Aucune action bloquante pour le moment.
          </div>
        ) : (
          actions.map((action) => (
            <div
              key={action.id}
              className="grid grid-cols-[1fr_auto] gap-3 py-3 sm:grid-cols-[150px_minmax(0,1fr)_auto]"
            >
              <div className="hidden items-center gap-2 text-[11px] text-anac-muted sm:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-anac-blue">
                  {action.owner.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <p className="font-semibold text-anac-navy">{action.owner}</p>
                  <p>{action.responsibleService}</p>
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-anac-navy">
                    {action.title}
                  </p>
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                      action.canAct
                        ? 'border-blue-100 bg-blue-50 text-anac-blue'
                        : 'border-slate-100 bg-slate-50 text-anac-muted'
                    )}
                  >
                    {action.accessLabel}
                  </span>
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize',
                      PRIORITY_STYLES[action.priority]
                    )}
                  >
                    {action.priority}
                  </span>
                  {action.slaLabel ? (
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                        SLA_STYLES[action.slaStatus ?? 'unknown']
                      )}
                    >
                      {action.slaLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[11px] text-anac-muted">
                  {action.dossierReference}
                  {action.organisationName ? ` - ${action.organisationName}` : ''}
                </p>
                {action.blockingReason ? (
                  <p className="mt-1 line-clamp-1 text-[11px] text-anac-muted">
                    {action.blockingReason}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-anac-muted">
                  <span>Depuis {formatDateTime(action.submittedAt)}</span>
                  {action.waitingLabel ? (
                    <span className={cn(action.waitingDays && action.waitingDays >= 3 ? 'text-anac-danger' : 'text-anac-warning')}>
                      {action.waitingLabel}
                    </span>
                  ) : null}
                  {action.applicantName ? <span>{action.applicantName}</span> : null}
                </div>
              </div>
              {action.canAct && action.href ? (
                <Link
                  to={action.href}
                  className="inline-flex items-center gap-1 self-start whitespace-nowrap text-[12px] font-semibold text-anac-blue hover:underline"
                >
                  Traiter
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              ) : !action.canAct ? (
                <span className="inline-flex items-center gap-1 self-start whitespace-nowrap text-[12px] font-semibold text-anac-muted">
                  <Eye size={14} aria-hidden="true" />
                  Suivre
                </span>
              ) : null}
            </div>
          ))
        )}
      </div>
    </DashboardSection>
  );
}
