import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, CalendarClock, Hourglass, MapPin } from 'lucide-react';
import { Modal } from '../ui/modal';
import { apiErrorMessage } from '../../lib/axios';
import { notify } from '../../lib/notify';
import {
  confirmMeeting,
  proposeMeetingAlternate,
  type MeetingConfirmationBlock,
} from '../../lib/api/meetings.api';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { TicketLink } from './TicketLink';

/** SESSION1-MEET-1 - the applicant side of an M3/M4 appointment: proposed by
 *  the DN (confirm or propose another date), counter-proposed (waiting for the
 *  DN), refused (answer again) or confirmed (invitation available). Used by the
 *  dossier phase sections and « Mes réunions ». */

export type ConfirmableMeeting = MeetingConfirmationBlock & {
  id: number;
  scheduledAt: string;
  location: string | null;
  status: string;
};

export function formatSlot(value: string): string {
  return new Date(value).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The panel replaces the plain details for a live M3/M4 appointment. */
export function usesConfirmationPanel(
  meeting: Pick<ConfirmableMeeting, 'status' | 'confirmationStatus'>
): boolean {
  return meeting.status === 'scheduled' && meeting.confirmationStatus !== 'not_required';
}

/** datetime-local value (local wall clock) for "now", used as the minimum. */
function localNowInputValue(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function Slot({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <p className="text-sm">
      <span className="text-anac-muted">{label} : </span>
      <span className={strong ? 'font-semibold text-anac-navy' : 'font-medium text-anac-navy'}>
        {formatSlot(value)}
      </span>
    </p>
  );
}

export function MeetingConfirmationPanel({ meeting }: { meeting: ConfirmableMeeting }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [dateTime, setDateTime] = useState('');
  const [remark, setRemark] = useState('');
  const canAnswer = meeting.actions?.length > 0;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.requests.all() }),
    ]);
  }

  async function handleConfirm() {
    setBusy(true);
    try {
      await confirmMeeting(meeting.id);
      notify.success('Rendez-vous confirmé.');
      await refresh();
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de confirmer le rendez-vous.'));
    } finally {
      setBusy(false);
    }
  }

  async function handlePropose(event: FormEvent) {
    event.preventDefault();
    if (!dateTime || !remark.trim()) return;
    setBusy(true);
    try {
      // datetime-local is the applicant's wall clock: sent as an ISO instant with offset.
      await proposeMeetingAlternate(meeting.id, new Date(dateTime).toISOString(), remark.trim());
      notify.success('Votre proposition a été transmise à la DN.');
      setProposing(false);
      setDateTime('');
      setRemark('');
      await refresh();
    } catch (err) {
      notify.error(apiErrorMessage(err, "Impossible d'envoyer votre proposition."));
    } finally {
      setBusy(false);
    }
  }

  const location = meeting.location ? (
    <p className="inline-flex items-center gap-1 text-sm text-anac-text">
      <MapPin size={14} className="text-anac-muted" aria-hidden="true" />
      {meeting.location}
    </p>
  ) : null;

  if (meeting.confirmationStatus === 'confirmed') {
    return (
      <div
        className="mt-3 space-y-2 rounded-lg border border-anac-success/30 bg-anac-success/5 p-3"
        role="region"
        aria-label="Rendez-vous confirmé"
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold text-anac-success">
          <CalendarCheck2 size={16} aria-hidden="true" /> Rendez-vous confirmé
        </p>
        <p className="text-base font-semibold text-anac-navy">{formatSlot(meeting.scheduledAt)}</p>
        {location}
        {meeting.ticketAvailable && (
          <TicketLink meetingId={meeting.id} label="Voir mon invitation (PDF)" />
        )}
      </div>
    );
  }

  if (meeting.confirmationStatus === 'awaiting_dn') {
    return (
      <div
        className="mt-3 space-y-2 rounded-lg border border-anac-border bg-white p-3"
        role="region"
        aria-label="Nouvelle date proposée"
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold text-anac-navy">
          <Hourglass size={16} className="text-anac-blue" aria-hidden="true" /> Nouvelle date
          proposée
        </p>
        <Slot label="Rendez-vous initial" value={meeting.scheduledAt} />
        {meeting.alternate && (
          <>
            <Slot label="Date proposée" value={meeting.alternate.scheduledAt} strong />
            <p className="text-sm">
              <span className="text-anac-muted">Votre remarque : </span>
              <span className="text-anac-text">{meeting.alternate.remark}</span>
            </p>
          </>
        )}
        <p className="inline-flex rounded bg-anac-sky/10 px-2 py-0.5 text-xs font-medium text-anac-blue">
          En attente de validation par la DN
        </p>
      </div>
    );
  }

  // awaiting_applicant (first proposal, or after a refusal)
  return (
    <div
      className="mt-3 space-y-3 rounded-lg border border-anac-warning/40 bg-anac-warning/5 p-3"
      role="region"
      aria-label="Rendez-vous proposé"
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold text-anac-navy">
        <CalendarClock size={16} className="text-anac-warning" aria-hidden="true" /> Rendez-vous
        proposé
      </p>
      {meeting.lastRefusal && (
        <div className="rounded border border-anac-border bg-white p-2 text-sm" role="status">
          <p className="font-medium text-anac-navy">
            La date proposée n&apos;a pas été retenue par la DN.
          </p>
          <p className="text-anac-muted">
            Date proposée : {formatSlot(meeting.lastRefusal.proposedSlotAt)}
          </p>
          <p className="text-anac-text">Motif : {meeting.lastRefusal.reason}</p>
        </div>
      )}
      <p className="text-sm text-anac-text">
        La Direction de la Navigabilité vous propose le rendez-vous suivant.
      </p>
      <p className="text-base font-semibold text-anac-navy">{formatSlot(meeting.scheduledAt)}</p>
      {location}
      {canAnswer && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary rounded px-3 py-1.5 text-xs"
            onClick={handleConfirm}
            disabled={busy}
          >
            Confirmer le rendez-vous
          </button>
          <button
            type="button"
            className="btn-secondary rounded px-3 py-1.5 text-xs"
            onClick={() => setProposing(true)}
            disabled={busy}
          >
            Proposer une autre date
          </button>
        </div>
      )}

      {proposing && (
        <Modal
          title="Proposer une autre date"
          subtitle="La DN examinera votre proposition. Le rendez-vous initial reste réservé en attendant."
          onClose={() => setProposing(false)}
        >
          <form onSubmit={handlePropose} className="space-y-3">
            <div>
              <label className="label" htmlFor={`alternate-at-${meeting.id}`}>
                Date et heure proposées
              </label>
              <input
                id={`alternate-at-${meeting.id}`}
                type="datetime-local"
                className="input"
                min={localNowInputValue()}
                value={dateTime}
                onChange={(event) => setDateTime(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor={`alternate-remark-${meeting.id}`}>
                Remarque (obligatoire)
              </label>
              <textarea
                id={`alternate-remark-${meeting.id}`}
                className="input min-h-[80px]"
                value={remark}
                maxLength={1000}
                onChange={(event) => setRemark(event.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary rounded px-3 py-1.5 text-xs"
                onClick={() => setProposing(false)}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="btn-primary rounded px-3 py-1.5 text-xs"
                disabled={busy || !dateTime || !remark.trim()}
              >
                Envoyer ma proposition
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
