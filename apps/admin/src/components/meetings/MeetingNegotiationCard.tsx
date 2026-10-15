import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, RotateCcw, XCircle } from 'lucide-react';
import { Button } from '../ui/button';
import type { MeetingNegotiationView } from '../../lib/api/meetings.types';
import { useMeetingNegotiationActions } from './useMeetingNegotiationActions';

/** SESSION1-MEET-1 - the one control surface for an M3/M4 appointment that
 *  is not confirmed yet, used by the Réunions page and the M3 / M4
 *  workspaces. Confirmed or not_required meetings render only their history
 *  here: the caller keeps its usual actions (tenue, absence...). */

export function formatSlot(value: string): string {
  return new Date(value).toLocaleString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function waitingLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "depuis aujourd'hui";
  return `depuis ${days} jour${days > 1 ? 's' : ''}`;
}

interface MeetingNegotiationCardProps {
  meeting: { id: number; scheduledAt: string };
  negotiation: MeetingNegotiationView;
  /** K7 - closed dossier (or no DN right): information only. */
  readOnly?: boolean;
  /** Opens the caller's reschedule form - a new proposal for the applicant. */
  onReschedule?: () => void;
  setActionError: (message: string | null) => void;
  onChanged: () => unknown;
}

export function MeetingNegotiationCard({
  meeting,
  negotiation,
  readOnly = false,
  onReschedule,
  setActionError,
  onChanged,
}: MeetingNegotiationCardProps) {
  const { busy, accept, refuse, confirmOnBehalf } = useMeetingNegotiationActions(setActionError, onChanged);
  const [mode, setMode] = useState<'idle' | 'refusing' | 'on_behalf'>('idle');
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const actions = readOnly ? [] : negotiation.availableNegotiationActions;

  function close() {
    setMode('idle');
    setText('');
  }

  async function handleAccept() {
    const result = await accept(meeting.id);
    if (result?.softOverlapWarning) {
      setNotice('Date acceptée. Attention : cet agent a déjà une autre réunion ce jour-là.');
    }
  }

  async function handleSubmit() {
    const value = text.trim();
    if (!value) return;
    const ok = mode === 'refusing' ? await refuse(meeting.id, value) : await confirmOnBehalf(meeting.id, value);
    if (ok) close();
  }

  const form =
    mode !== 'idle' ? (
      <div className="space-y-2">
        <label className="label" htmlFor={`negotiation-text-${meeting.id}`}>
          {mode === 'refusing' ? 'Motif du refus' : 'Comment la confirmation a-t-elle été reçue ? (téléphone, courrier…)'}
        </label>
        <textarea
          id={`negotiation-text-${meeting.id}`}
          className="input min-h-[72px]"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={1000}
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy || !text.trim()} onClick={handleSubmit}>
            {mode === 'refusing' ? 'Confirmer le refus' : 'Enregistrer la confirmation'}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={close} disabled={busy}>
            Annuler
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-3">
      {notice && <p className="text-xs text-anac-warning">{notice}</p>}

      {negotiation.confirmationStatus === 'awaiting_applicant' && (
        <div className="space-y-2 rounded-lg border border-anac-border bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-anac-blue">
              <Clock3 size={12} aria-hidden="true" /> En attente du postulant
            </span>
            {waitingLabel(negotiation.waitingDays) && (
              <span className="text-xs text-anac-muted">{waitingLabel(negotiation.waitingDays)}</span>
            )}
          </div>
          <p className="text-xs text-anac-muted">
            Rendez-vous proposé : <span className="font-medium text-anac-navy">{formatSlot(meeting.scheduledAt)}</span>
          </p>
          {form ??
            (!readOnly && (
              <div className="flex flex-wrap gap-2">
                {onReschedule && (
                  <Button type="button" size="sm" variant="secondary" className="gap-1" onClick={onReschedule} disabled={busy}>
                    <RotateCcw size={12} /> Replanifier
                  </Button>
                )}
                {actions.includes('confirm_on_behalf') && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="gap-1"
                    onClick={() => setMode('on_behalf')}
                    disabled={busy}
                  >
                    <CheckCircle2 size={12} /> Confirmer au nom du postulant
                  </Button>
                )}
              </div>
            ))}
        </div>
      )}

      {negotiation.confirmationStatus === 'awaiting_dn' && negotiation.alternate && (
        <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50 p-3" role="region" aria-label="Contre-proposition du postulant">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-anac-warning">
            <AlertTriangle size={14} aria-hidden="true" /> Contre-proposition du postulant
            {waitingLabel(negotiation.waitingDays) && (
              <span className="text-xs font-normal text-anac-muted">({waitingLabel(negotiation.waitingDays)})</span>
            )}
          </p>
          <dl className="grid gap-1 text-xs">
            <div>
              <dt className="inline text-anac-muted">Rendez-vous initial : </dt>
              <dd className="inline font-medium text-anac-navy">{formatSlot(meeting.scheduledAt)}</dd>
            </div>
            <div>
              <dt className="inline text-anac-muted">Date proposée : </dt>
              <dd className="inline font-semibold text-anac-navy">{formatSlot(negotiation.alternate.scheduledAt)}</dd>
            </div>
            <div>
              <dt className="inline text-anac-muted">Remarque du postulant : </dt>
              <dd className="inline text-anac-text">{negotiation.alternate.remark}</dd>
            </div>
          </dl>
          {negotiation.alternateSlotTaken && (
            <p className="text-xs text-anac-danger">Ce créneau est déjà occupé pour l&apos;agent assigné.</p>
          )}
          {form ??
            (!readOnly && actions.includes('accept_alternate') && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="gap-1"
                  onClick={handleAccept}
                  disabled={busy || negotiation.alternateSlotTaken}
                  title={negotiation.alternateSlotTaken ? "Créneau déjà occupé pour l'agent assigné" : undefined}
                >
                  <CheckCircle2 size={12} /> Accepter cette date
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-1"
                  onClick={() => setMode('refusing')}
                  disabled={busy}
                >
                  <XCircle size={12} /> Refuser
                </Button>
              </div>
            ))}
        </div>
      )}

      {negotiation.history && negotiation.history.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-anac-muted">Historique du rendez-vous</summary>
          <ol className="mt-2 space-y-1.5 border-l border-anac-border pl-3">
            {negotiation.history.map((event, index) => (
              <li key={`${event.meetingId}-${event.createdAt}-${index}`}>
                <span className="text-anac-muted">{formatSlot(event.createdAt)} - </span>
                <span className="font-medium text-anac-navy">{event.label}</span>
                {event.actor.name && <span className="text-anac-muted"> ({event.actor.name})</span>}
                {event.slotAt && event.kind !== 'applicant_confirmed' && (
                  <span className="text-anac-text"> : {formatSlot(event.slotAt)}</span>
                )}
                {event.remark && <span className="block text-anac-muted">« {event.remark} »</span>}
                {event.reason && <span className="block text-anac-muted">Motif : {event.reason}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
