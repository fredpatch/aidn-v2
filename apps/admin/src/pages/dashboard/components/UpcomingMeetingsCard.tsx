import { CalendarDays } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { DashboardMeetingItem } from '../../../lib/api/dashboard.types';
import { formatDateTime } from '../dashboard.helpers';
import { DashboardSection } from './DashboardSection';
import { EmptyDashboardState } from './EmptyDashboardState';

export function UpcomingMeetingsCard({ meetings }: { meetings: DashboardMeetingItem[] }) {
  return (
    <DashboardSection
      className="p-5"
      title="Reunions planifiees"
      action={<CalendarDays size={16} className="text-anac-blue" aria-hidden="true" />}
    >
      <div className="mt-4 space-y-3">
        {meetings.length === 0 ? (
          <EmptyDashboardState
            title="Aucune reunion prevue"
            description="Aucun rendez-vous planifie sur les 7 prochains jours."
          />
        ) : (
          meetings.map((meeting) => (
            <div
              key={meeting.id}
              className="flex items-start justify-between gap-3 border-b border-anac-border pb-3 last:border-0 last:pb-0"
            >
              <div className="flex gap-3">
                <CalendarDays size={16} className="mt-0.5 text-anac-blue" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-anac-navy">{meeting.title}</p>
                  <p className="text-[12px] text-anac-muted">{meeting.requestReference}</p>
                  <p className="text-[12px] text-anac-text">
                    {formatDateTime(meeting.scheduledAt)}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-1 text-[11px] font-semibold',
                  meeting.tag === 'today'
                    ? 'bg-green-50 text-anac-success'
                    : 'bg-blue-50 text-anac-blue'
                )}
              >
                {meeting.tag === 'today' ? "Aujourd'hui" : 'Prevue'}
              </span>
            </div>
          ))
        )}
      </div>
    </DashboardSection>
  );
}
