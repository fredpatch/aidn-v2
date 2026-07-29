import { Circle } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { DashboardStatusStat } from '../../../lib/api/dashboard.types';
import { EmptyDashboardState } from './EmptyDashboardState';
import { DashboardSection } from './DashboardSection';

export function StatusDistributionCard({ items }: { items: DashboardStatusStat[] }) {
  return (
    <DashboardSection
      className="p-5"
      title="Repartition des dossiers"
      description="Par statut courant."
    >
      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <EmptyDashboardState
            title="Aucun dossier a afficher"
            description="Aucune demande ne correspond aux statuts suivis par le tableau de bord."
          />
        ) : (
          items.map((item) => (
            <div
              key={item.status}
              className="grid grid-cols-[112px_1fr_76px] items-center gap-3 text-[12px]"
            >
              <span className="inline-flex items-center gap-2 font-medium text-anac-navy">
                <Circle
                  size={12}
                  aria-hidden="true"
                  className={cn(
                    item.status === 'completed'
                      ? 'text-anac-success'
                      : item.status === 'rejected' || item.status === 'cancelled'
                        ? 'text-anac-danger'
                        : item.status === 'pending_review'
                          ? 'text-anac-warning'
                          : 'text-anac-blue'
                  )}
                />
                {item.label}
              </span>
              <div className="h-1.5 rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-anac-sky"
                  style={{ width: `${Math.max(item.percentage, 4)}%` }}
                />
              </div>
              <span className="text-right text-anac-muted">
                {item.count} - {item.percentage}%
              </span>
            </div>
          ))
        )}
      </div>
    </DashboardSection>
  );
}
