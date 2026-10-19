import { Link } from 'react-router-dom';
import { Activity, Circle } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { DashboardActivityItem } from '../../../lib/api/dashboard.types';
import { formatDateTime, TONE_STYLES } from '../dashboard.helpers';
import { DashboardSection } from './DashboardSection';
import { EmptyDashboardState } from './EmptyDashboardState';

export function ActivityTimeline({ activity }: { activity: DashboardActivityItem[] }) {
  return (
    <DashboardSection
      className="p-5"
      title="Activité récente"
      action={<Activity size={16} className="text-anac-blue" aria-hidden="true" />}
    >
      <div className="mt-4 space-y-4">
        {activity.length === 0 ? (
          <EmptyDashboardState
            title="Aucune activité métier récente"
            description="Les connexions techniques ne sont pas affichées ici."
          />
        ) : (
          activity.map((item) => (
            <div key={item.id} className="flex gap-3">
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border',
                  TONE_STYLES[item.tone]
                )}
              >
                <Circle size={12} fill="currentColor" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-anac-navy first-letter:uppercase">{item.title}</p>
                {/* DASH-DN-UX-1 - the dossier, never the audit entity id. */}
                {item.requestReference ? (
                  item.href ? (
                    <Link
                      to={item.href}
                      className="block truncate text-[12px] font-medium text-anac-blue hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
                    >
                      {item.requestReference}
                    </Link>
                  ) : (
                    <p className="truncate text-[12px] font-medium text-anac-navy">{item.requestReference}</p>
                  )
                ) : null}
                <p className="text-[12px] text-anac-muted">
                  {formatDateTime(item.createdAt)} · {item.actor}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardSection>
  );
}
