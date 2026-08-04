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
      title="Activite recente"
      action={<Activity size={16} className="text-anac-blue" aria-hidden="true" />}
    >
      <div className="mt-4 space-y-4">
        {activity.length === 0 ? (
          <EmptyDashboardState
            title="Aucune activite metier recente"
            description="Les connexions techniques ne sont pas affichees ici."
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
              <div>
                <p className="text-sm font-medium capitalize text-anac-navy">{item.title}</p>
                <p className="text-[12px] text-anac-muted">
                  {item.requestReference ? `${item.requestReference} - ` : ''}
                  {formatDateTime(item.createdAt)} par {item.actor}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardSection>
  );
}
