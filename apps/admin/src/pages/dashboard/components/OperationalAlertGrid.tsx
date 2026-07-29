import { Link } from 'react-router-dom';
import { AlertTriangle, Eye } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { DashboardAlert } from '../../../lib/api/dashboard.types';
import { TONE_STYLES } from '../dashboard.helpers';
import { DashboardSection } from './DashboardSection';

export function OperationalAlertGrid({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <DashboardSection className="p-5" title="Alertes et blocages">
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {alerts.map((alert) => {
          const content = (
            <>
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} aria-hidden="true" />
                <p className="text-[12px] font-semibold">{alert.title}</p>
              </div>
              <p className="mt-3 text-xl font-semibold">{alert.value}</p>
              <p className="mt-1 text-[11px] opacity-80">{alert.helper}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5',
                    alert.canAct
                      ? 'border-blue-100 bg-blue-50 text-anac-blue'
                      : 'border-slate-100 bg-white/70 text-anac-muted'
                  )}
                >
                  {alert.accessLabel}
                </span>
                {!alert.canAct ? (
                  <span className="inline-flex items-center gap-1 text-anac-muted">
                    <Eye size={12} aria-hidden="true" />
                    Suivi
                  </span>
                ) : null}
              </div>
            </>
          );

          if (alert.canAct && alert.href) {
            return (
              <Link
                key={alert.key}
                to={alert.href}
                className={cn(
                  'rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky',
                  TONE_STYLES[alert.tone]
                )}
              >
                {content}
              </Link>
            );
          }

          return (
            <div
              key={alert.key}
              className={cn('rounded-lg border p-4', TONE_STYLES[alert.tone])}
            >
              {content}
            </div>
          );
        })}
      </div>
    </DashboardSection>
  );
}
