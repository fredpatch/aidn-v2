import { Link } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { TicketLink } from './TicketLink';
import { useMyMeetings } from '../../pages/meetings/useMyMeetings';
import { formatMeetingDate, formatMeetingTime, relativeDayLabel, splitMeetings } from '../../lib/meetings';
import { MEETING_TYPE_LABELS, labelOf } from '../../pages/requests/constants';

/** Dashboard card - rendered only when a meeting is still to come. */
export function NextMeetingCard() {
  const { meetings } = useMyMeetings();
  if (!meetings) return null;
  const now = new Date();
  const next = splitMeetings(meetings, now).upcoming[0];
  if (!next) return null;

  return (
    <section
      aria-label="Prochaine réunion"
      className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-anac-blue/30 bg-white p-4"
    >
      <div className="flex min-w-0 items-start gap-3">
        <CalendarClock size={20} className="mt-0.5 flex-shrink-0 text-anac-blue" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs text-anac-muted">Prochaine réunion · {relativeDayLabel(new Date(next.scheduledAt), now).toLowerCase()}</p>
          <p className="text-sm font-semibold text-anac-navy">
            {labelOf(MEETING_TYPE_LABELS, next.meetingType, 'Réunion')} — {formatMeetingDate(next.scheduledAt)} à {formatMeetingTime(next.scheduledAt)}
          </p>
          <p className="text-xs text-anac-muted">
            {next.location ? `${next.location} · ` : ''}
            {next.requestReference}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {next.ticketAvailable && <TicketLink meetingId={next.id} label="Invitation" />}
        <Link to="/reunions" className="text-xs text-anac-blue underline">Mes réunions</Link>
      </div>
    </section>
  );
}
