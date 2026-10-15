import { Link } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { useMyMeetings } from '../../pages/meetings/useMyMeetings';
import { needsApplicantAnswer } from '../../lib/meetings';

/** SESSION1-MEET-1 - dashboard action banner while at least one appointment
 *  proposed by the DN waits for the applicant's answer. No e-mail is sent:
 *  this banner is how the applicant learns about it. */
export function MeetingsToConfirmBanner() {
  const { meetings } = useMyMeetings();
  const toAnswer = (meetings ?? []).filter(needsApplicantAnswer);
  if (toAnswer.length === 0) return null;
  const single = toAnswer.length === 1;

  return (
    <section
      aria-label="Rendez-vous à confirmer"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-anac-warning/50 bg-anac-warning/10 p-4"
    >
      <div className="flex items-start gap-3">
        <CalendarClock size={20} className="mt-0.5 flex-shrink-0 text-anac-warning" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-anac-navy">
            Rendez-vous à confirmer{single ? '' : ` (${toAnswer.length})`}
          </p>
          <p className="text-xs text-anac-text">
            {single
              ? `La DN vous propose un rendez-vous pour le dossier ${toAnswer[0].requestReference}. Confirmez-le ou proposez une autre date.`
              : 'La DN vous propose des rendez-vous. Confirmez-les ou proposez une autre date.'}
          </p>
        </div>
      </div>
      <Link to="/reunions" className="btn-primary rounded px-3 py-1.5 text-xs">
        Répondre
      </Link>
    </section>
  );
}
