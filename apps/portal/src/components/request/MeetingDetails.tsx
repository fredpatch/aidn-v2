import FileLink from '../files/FileLink';
import { MEETING_STATUS_LABELS, labelOf } from '../../pages/requests/constants';
import { formatDateTime } from '../../lib/format';

export function isMeetingResolved(status: string | undefined): boolean {
  return status === 'held' || status === 'no_show' || status === 'file_cancelled';
}

/**
 * Date / lieu / statut block for a meeting or site visit. The invitation link
 * is shown only for a scheduled meeting that has an id (site visits have none).
 */
export function MeetingDetails({
  meeting,
}: {
  meeting: {
    id?: number;
    scheduledAt: string;
    location: string | null;
    status: string;
    crDocumentUrl?: string | null;
  };
}) {
  return (
    <div className="mt-3 space-y-2 text-sm">
      <p>
        <span className="text-anac-muted">Date : </span>
        <span className="font-medium text-anac-navy">{formatDateTime(meeting.scheduledAt)}</span>
      </p>
      {meeting.location && (
        <p>
          <span className="text-anac-muted">Lieu : </span>
          <span className="font-medium text-anac-navy">{meeting.location}</span>
        </p>
      )}
      <p>
        <span className="text-anac-muted">Statut : </span>
        <span className="font-medium text-anac-navy">
          {labelOf(MEETING_STATUS_LABELS, meeting.status)}
        </span>
      </p>
      {meeting.id !== undefined && meeting.status === 'scheduled' && (
        <a
          href={`/api/meetings/${meeting.id}/ticket`}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary inline-flex rounded px-3 py-1.5 text-xs"
        >
          Voir mon invitation
        </a>
      )}
      {meeting.crDocumentUrl && (
        <FileLink address={meeting.crDocumentUrl} className="inline-flex text-xs text-anac-blue underline">
          Consulter le compte-rendu
        </FileLink>
      )}
    </div>
  );
}
