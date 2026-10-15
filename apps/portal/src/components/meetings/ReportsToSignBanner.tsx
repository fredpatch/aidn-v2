import { Link } from 'react-router-dom';
import { FileSignature } from 'lucide-react';
import { useMyMeetings } from '../../pages/meetings/useMyMeetings';
import { MEETING_TYPE_LABELS, labelOf } from '../../pages/requests/constants';
import { meetingReportAnchor } from './MeetingReportPanel';

/** SESSION1-MEET-2 - dashboard action banner while at least one meeting
 *  compte rendu waits for the applicant's signed copy. Driven only by the API's
 *  canSubmitSignedReport; each item links to the report panel in its dossier.
 *  In-app only: no e-mail is sent. */
export function ReportsToSignBanner() {
  const { meetings } = useMyMeetings();
  const toSign = (meetings ?? []).filter((meeting) => meeting.canSubmitSignedReport);
  if (toSign.length === 0) return null;
  const single = toSign.length === 1;
  const target = (meeting: (typeof toSign)[number]) => ({
    pathname: `/dossiers/${meeting.requestId}`,
    hash: `#${meetingReportAnchor(meeting.id)}`,
  });

  return (
    <section
      aria-label="Compte rendu à signer"
      className="rounded-lg border border-anac-warning/50 bg-anac-warning/10 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <FileSignature size={20} className="mt-0.5 flex-shrink-0 text-anac-warning" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-anac-navy">
              Compte rendu à signer{single ? '' : ` (${toSign.length})`}
            </p>
            <p className="text-xs text-anac-text">
              {single
                ? `Un compte rendu de réunion est disponible et doit être retourné signé (dossier ${toSign[0].requestReference}).`
                : 'Des comptes rendus de réunion sont disponibles et doivent être retournés signés.'}
            </p>
          </div>
        </div>
        {single && (
          <Link to={target(toSign[0])} className="btn-primary rounded px-3 py-1.5 text-xs">
            Voir le dossier
          </Link>
        )}
      </div>
      {!single && (
        <ul className="mt-3 space-y-2">
          {toSign.map((meeting) => (
            <li key={meeting.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-anac-text">
              <span>
                {labelOf(MEETING_TYPE_LABELS, meeting.meetingType, 'Réunion')} · dossier {meeting.requestReference}
              </span>
              <Link to={target(meeting)} className="btn-primary rounded px-3 py-1.5 text-xs">
                Voir le dossier
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
