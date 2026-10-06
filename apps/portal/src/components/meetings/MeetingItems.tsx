import { Link } from 'react-router-dom';
import { CalendarDays, MapPin } from 'lucide-react';
import FileLink from '../files/FileLink';
import { TicketLink } from './TicketLink';
import type { ApplicantMeeting } from '../../lib/api/meetings.api';
import { formatMeetingDate, formatMeetingTime, isAwaitingConfirmation, relativeDayLabel } from '../../lib/meetings';
import { MEETING_STATUS_LABELS, MEETING_TYPE_LABELS, labelOf } from '../../pages/requests/constants';

const STATUS_TONES: Record<string, string> = {
  held: 'bg-anac-success/10 text-anac-success',
  no_show: 'bg-anac-danger/10 text-anac-danger',
  rescheduled: 'bg-anac-gray text-anac-muted',
  file_cancelled: 'bg-anac-gray text-anac-muted',
};

/** Upcoming meeting: everything needed to show up, plus the invitation. */
export function UpcomingMeetingCard({ meeting, now }: { meeting: ApplicantMeeting; now: Date }) {
  return (
    <article className="rounded-lg border border-anac-blue/30 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-anac-navy">{labelOf(MEETING_TYPE_LABELS, meeting.meetingType, 'Réunion')}</h3>
        <span className="rounded bg-anac-sky/10 px-2 py-0.5 text-[11px] font-medium text-anac-blue">
          {relativeDayLabel(new Date(meeting.scheduledAt), now)}
        </span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-anac-text">
        <span className="inline-flex items-center gap-1">
          <CalendarDays size={14} className="text-anac-muted" aria-hidden="true" />
          {formatMeetingDate(meeting.scheduledAt)} · {formatMeetingTime(meeting.scheduledAt)}
        </span>
        {meeting.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin size={14} className="text-anac-muted" aria-hidden="true" />
            {meeting.location}
          </span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-anac-muted">Dossier {meeting.requestReference}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {meeting.ticketAvailable && <TicketLink meetingId={meeting.id} />}
        <Link to={`/dossiers/${meeting.requestId}`} className="text-xs text-anac-blue underline">
          Voir le dossier
        </Link>
      </div>
    </article>
  );
}

/** Past or superseded meeting, one compact row. */
export function MeetingHistoryRow({ meeting, now }: { meeting: ApplicantMeeting; now: Date }) {
  const awaiting = isAwaitingConfirmation(meeting, now);
  const superseded = meeting.status === 'rescheduled';
  const statusLabel = awaiting ? 'En attente de confirmation' : labelOf(MEETING_STATUS_LABELS, meeting.status);
  const tone = awaiting ? 'bg-anac-warning/10 text-anac-warning' : STATUS_TONES[meeting.status] ?? 'bg-anac-gray text-anac-muted';

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="min-w-0">
        <p className={`text-sm ${superseded ? 'text-anac-muted line-through' : 'text-anac-navy'}`}>
          {labelOf(MEETING_TYPE_LABELS, meeting.meetingType, 'Réunion')}
        </p>
        <p className="text-xs text-anac-muted">
          {formatMeetingDate(meeting.scheduledAt)} · {formatMeetingTime(meeting.scheduledAt)} ·{' '}
          <Link to={`/dossiers/${meeting.requestId}`} className="hover:underline">{meeting.requestReference}</Link>
          {meeting.crDocumentUrl && (
            <>
              {' · '}
              <FileLink address={meeting.crDocumentUrl} className="text-anac-blue underline">
                compte-rendu
              </FileLink>
            </>
          )}
        </p>
      </div>
      <span className={`whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium ${tone}`}>{statusLabel}</span>
    </li>
  );
}
