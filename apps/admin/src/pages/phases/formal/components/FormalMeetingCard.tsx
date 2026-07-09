import { FormEvent, useState } from 'react';
import { CalendarClock, CheckCircle2, FileUp, RotateCcw, Ticket, XCircle } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { API_ORIGIN, MEETING_STATUS_LABELS, MEETING_STATUS_TONES } from '../constants';
import { formatDate, formatDateTime } from '../helpers';
import { useFormalMeetingActions } from '../hooks/useFormalMeetingActions';
import type { FormalMeetingView } from '../types';
import PhaseStatusBadge from '../../preliminary/components/PhaseStatusBadge';

interface FormalMeetingCardProps {
  phaseId: number;
  meeting: FormalMeetingView | null;
  dnAgentId: number;
  requestId: string | undefined;
  documentsComplete: boolean;
  setActionError: (message: string | null) => void;
}

export default function FormalMeetingCard({
  phaseId,
  meeting,
  dnAgentId,
  requestId,
  documentsComplete,
  setActionError,
}: FormalMeetingCardProps) {
  const [scheduling, setScheduling] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [dateTime, setDateTime] = useState('');
  const [location, setLocation] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [sendingReport, setSendingReport] = useState(false);
  const [reportFile, setReportFile] = useState<File | null>(null);

  const { busy, schedule, reschedule, markStatus, sendReport } = useFormalMeetingActions(
    requestId,
    setActionError
  );

  async function handleSchedule(e: FormEvent) {
    e.preventDefault();
    setWarning(null);
    const result = await schedule({ phaseId, dnAgentId, dateTime, location });
    if (result?.softOverlapWarning) {
      setWarning(
        'Attention : vous avez déjà une autre réunion ce jour-là, à un horaire différent.'
      );
    }
    if (result) {
      setScheduling(false);
      setDateTime('');
      setLocation('');
    }
  }

  async function handleReschedule(e: FormEvent) {
    e.preventDefault();
    if (!meeting) return;
    const ok = await reschedule(meeting.id, dateTime);
    if (ok) {
      setRescheduling(false);
      setDateTime('');
    }
  }

  async function handleSendReport() {
    if (!meeting || !reportFile) {
      setActionError('Merci de sélectionner un fichier pour le compte-rendu.');
      return;
    }
    const ok = await sendReport(meeting.id, reportFile);
    if (ok) {
      setSendingReport(false);
      setReportFile(null);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock size={16} className="text-anac-navy" />
        <span className="font-medium text-sm">Réunion formelle</span>
      </div>

      {warning && <p className="text-anac-warning text-xs">{warning}</p>}

      {!documentsComplete && !meeting ? (
        <p className="text-anac-muted text-sm">
          La réunion formelle sera planifiable une fois les 11 documents soumis par le postulant.
        </p>
      ) : !meeting ? (
        scheduling ? (
          <form onSubmit={handleSchedule} className="space-y-3">
            <div>
              <label className="label">Date et heure</label>
              <input
                type="datetime-local"
                className="input"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Lieu (optionnel)</label>
              <input
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy}>
                Planifier
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setScheduling(false)}
              >
                Annuler
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" onClick={() => setScheduling(true)}>
            Planifier la réunion formelle
          </Button>
        )
      ) : rescheduling ? (
        <form onSubmit={handleReschedule} className="space-y-3">
          <div>
            <label className="label">Nouvelle date et heure</label>
            <input
              type="datetime-local"
              className="input"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              required
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              Confirmer
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRescheduling(false)}
            >
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            {formatDateTime(meeting.scheduledAt)}
            {meeting.location && ` — ${meeting.location}`}
          </p>

          <PhaseStatusBadge
            status={meeting.status}
            label={MEETING_STATUS_LABELS[meeting.status] ?? meeting.status}
            toneMap={MEETING_STATUS_TONES}
            fallbackTone="bg-anac-info/10 text-anac-info"
          />

          {meeting.status === 'scheduled' && (
            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href={`${API_ORIGIN}/api/meetings/${meeting.id}/ticket`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary text-xs inline-flex items-center gap-1 px-2 py-1 rounded"
              >
                <Ticket size={12} /> Voir le ticket
              </a>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => markStatus(meeting.id, 'held')}
                disabled={busy}
                className="gap-1"
              >
                <CheckCircle2 size={12} /> Tenue
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => markStatus(meeting.id, 'no_show')}
                disabled={busy}
                className="gap-1"
              >
                <XCircle size={12} /> No-show
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setRescheduling(true)}
                disabled={busy}
                className="gap-1"
              >
                <RotateCcw size={12} /> Reprogrammer
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => markStatus(meeting.id, 'file_cancelled')}
                disabled={busy}
              >
                Annuler le dossier
              </Button>
            </div>
          )}

          {meeting.status === 'held' && (
            <div className="pt-1 space-y-2">
              {meeting.crDocumentUrl ? (
                <p className="text-sm">
                  Compte-rendu envoyé le {formatDate(meeting.crUploadedAt)} —{' '}
                  <a
                    href={`${API_ORIGIN}${meeting.crDocumentUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-anac-blue"
                  >
                    voir le fichier
                  </a>
                  {' — '}
                  <button
                    type="button"
                    className="underline text-anac-muted text-xs"
                    onClick={() => setSendingReport(true)}
                  >
                    remplacer
                  </button>
                </p>
              ) : sendingReport ? (
                <div className="flex items-center gap-2">
                  <input type="file" onChange={(e) => setReportFile(e.target.files?.[0] ?? null)} />
                  <Button size="sm" onClick={handleSendReport} disabled={busy}>
                    Envoyer
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSendingReport(false)}
                    disabled={busy}
                  >
                    Annuler
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSendingReport(true)}
                  className="gap-1"
                >
                  <FileUp size={12} /> Envoyer le compte-rendu (optionnel)
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
