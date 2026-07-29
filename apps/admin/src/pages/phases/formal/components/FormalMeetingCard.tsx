import { FormEvent, useState } from 'react';
import { CalendarClock, CheckCircle2, FileUp, RotateCcw, XCircle } from 'lucide-react';
import DocumentPreviewLink from '../../../../components/documents/DocumentPreviewLink';
import { Button } from '../../../../components/ui/button';
import CollapsibleCard from '../../../../components/ui/collapsible-card';
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
  letterReturned: boolean;
  canManage: boolean;
  setActionError: (message: string | null) => void;
}

export default function FormalMeetingCard({
  phaseId,
  meeting,
  dnAgentId,
  requestId,
  letterReturned,
  canManage,
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
      setWarning('Attention : vous avez deja une autre reunion ce jour-la, a un horaire different.');
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
      setActionError('Merci de selectionner un fichier pour le compte-rendu.');
      return;
    }
    const ok = await sendReport(meeting.id, reportFile);
    if (ok) {
      setSendingReport(false);
      setReportFile(null);
    }
  }

  function handleCancelFile() {
    if (!meeting) return;
    const confirmed = window.confirm(
      "Annuler ce dossier mettra fin a la demande formelle. Cette action sera inscrite dans l'historique. Confirmer l'annulation ?"
    );
    if (confirmed) {
      markStatus(meeting.id, 'file_cancelled');
    }
  }

  const meetingResolved =
    meeting?.status === 'held' || meeting?.status === 'no_show' || meeting?.status === 'file_cancelled';
  const shouldOpen = !meetingResolved;

  return (
    <CollapsibleCard
      title="Reunion formelle"
      icon={<CalendarClock size={16} className="text-anac-navy" />}
      defaultOpen={shouldOpen}
      resetKey={meeting?.status ?? 'missing'}
    >
      {warning && <p className="text-anac-warning text-xs">{warning}</p>}

      {!letterReturned && !meeting ? (
        <p className="text-anac-muted text-sm">
          La reunion formelle sera planifiable une fois la lettre de demande officielle revenue
          signee et scannee dans AIDN.
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
              <Button type="submit" size="sm" disabled={busy || !canManage}>
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
          <div className="space-y-2">
            <Button size="sm" onClick={() => setScheduling(true)} disabled={!canManage}>
              Planifier la reunion formelle
            </Button>
            {!canManage && <p className="text-anac-muted text-xs">Action reservee a la DN.</p>}
          </div>
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
            <Button type="submit" size="sm" disabled={busy || !canManage}>
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
            {meeting.location && ` - ${meeting.location}`}
          </p>

          <PhaseStatusBadge
            status={meeting.status}
            label={MEETING_STATUS_LABELS[meeting.status] ?? meeting.status}
            toneMap={MEETING_STATUS_TONES}
            fallbackTone="bg-anac-info/10 text-anac-info"
          />

          {meeting.status === 'scheduled' && (
            <div className="flex flex-wrap gap-2 pt-1">
              <DocumentPreviewLink
                title="Ticket de reunion formelle"
                url={`${API_ORIGIN}/api/meetings/${meeting.id}/ticket`}
                label="Voir le ticket"
                className="btn-secondary text-xs inline-flex items-center gap-1 px-2 py-1 rounded"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => markStatus(meeting.id, 'held')}
                disabled={busy || !canManage}
                className="gap-1"
              >
                <CheckCircle2 size={12} /> Tenue
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => markStatus(meeting.id, 'no_show')}
                disabled={busy || !canManage}
                className="gap-1"
              >
                <XCircle size={12} /> Absence
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setRescheduling(true)}
                disabled={busy || !canManage}
                className="gap-1"
              >
                <RotateCcw size={12} /> Reprogrammer
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleCancelFile}
                disabled={busy || !canManage}
              >
                Annuler le dossier
              </Button>
            </div>
          )}

          {meeting.status === 'held' && (
            <div className="pt-1 space-y-2">
              {meeting.crDocumentUrl ? (
                <p className="text-sm">
                  Compte-rendu envoye le {formatDate(meeting.crUploadedAt)} -{' '}
                  <DocumentPreviewLink
                    title="Compte-rendu de reunion formelle"
                    url={`${API_ORIGIN}${meeting.crDocumentUrl}`}
                  />
                  {' - '}
                  <button
                    type="button"
                    className="underline text-anac-muted text-xs"
                    disabled={!canManage}
                    onClick={() => setSendingReport(true)}
                  >
                    remplacer
                  </button>
                </p>
              ) : sendingReport ? (
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    disabled={!canManage}
                    onChange={(e) => setReportFile(e.target.files?.[0] ?? null)}
                  />
                  <Button size="sm" onClick={handleSendReport} disabled={busy || !canManage}>
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
                  disabled={!canManage}
                  className="gap-1"
                >
                  <FileUp size={12} /> Deposer le compte-rendu
                </Button>
              )}
              <p className="text-anac-muted text-xs">
                Le compte-rendu est facultatif pour la cloture de la phase.
              </p>
            </div>
          )}
          {!canManage && meeting.status === 'scheduled' && (
            <p className="text-anac-muted text-xs">Action reservee a la DN.</p>
          )}
        </div>
      )}
    </CollapsibleCard>
  );
}
