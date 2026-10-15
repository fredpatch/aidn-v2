import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MeetingNegotiationCard } from '../../../../components/meetings/MeetingNegotiationCard';
import { isOperationallyConfirmed } from '../../../../lib/api/meetings.types';
import { queryKeys } from '../../../../lib/react-query/queryKeys';
import { CalendarClock, CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { MeetingReportRows } from '../../../../components/meetings/MeetingReportRows';
import { Button } from '../../../../components/ui/button';
import CollapsibleCard from '../../../../components/ui/collapsible-card';
import { MEETING_STATUS_LABELS, MEETING_STATUS_TONES } from '../constants';
import { formatDateTime } from '../helpers';
import { ClosedDossierNote, useDossierReadOnly } from '../../components/DossierReadOnly';
import { useFormalMeetingActions } from '../hooks/useFormalMeetingActions';
import type { FormalMeetingView } from '../types';
import PhaseStatusBadge from '../../preliminary/components/PhaseStatusBadge';

const scheduleSchema = z.object({
  dateTime: z.string(),
  location: z.string().optional(),
});
type ScheduleFormValues = z.infer<typeof scheduleSchema>;

const rescheduleSchema = z.object({
  dateTime: z.string(),
});
type RescheduleFormValues = z.infer<typeof rescheduleSchema>;

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
  // K7b - closed dossier: the meeting and its report stay viewable, no action.
  const readOnly = useDossierReadOnly();
  const queryClient = useQueryClient();
  // SESSION1-MEET-1 - negotiation actions refresh this workspace's bundle.
  const refreshBundle = () =>
    requestId ? queryClient.invalidateQueries({ queryKey: queryKeys.formal.bundle(requestId) }) : undefined;
  const [scheduling, setScheduling] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const { busy, schedule, reschedule, markStatus, sendReport } = useFormalMeetingActions(
    requestId,
    setActionError
  );

  const scheduleForm = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: { dateTime: '', location: '' },
  });

  const rescheduleForm = useForm<RescheduleFormValues>({
    resolver: zodResolver(rescheduleSchema),
    defaultValues: { dateTime: '' },
  });

  async function onSchedule(values: ScheduleFormValues) {
    setWarning(null);
    const result = await schedule({ phaseId, dnAgentId, dateTime: values.dateTime, location: values.location });
    if (result?.softOverlapWarning) {
      setWarning('Attention : vous avez déjà une autre réunion ce jour-là, à un horaire différent.');
    }
    if (result) {
      setScheduling(false);
      scheduleForm.reset();
    }
  }

  async function onReschedule(values: RescheduleFormValues) {
    if (!meeting) return;
    const ok = await reschedule(meeting.id, values.dateTime);
    if (ok) {
      setRescheduling(false);
      rescheduleForm.reset();
    }
  }

  function handleCancelFile() {
    if (!meeting) return;
    const confirmed = window.confirm(
      "Annuler ce dossier mettra fin à la demande formelle. Cette action sera inscrite dans l'historique. Confirmer l'annulation ?"
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
      title="Réunion formelle"
      icon={<CalendarClock size={16} className="text-anac-navy" />}
      defaultOpen={shouldOpen}
      resetKey={meeting?.status ?? 'missing'}
    >
      {warning && <p className="text-anac-warning text-xs">{warning}</p>}

      {readOnly ? (
        meeting ? (
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
            {meeting.status === 'held' && (
              <MeetingReportRows title="Réunion formelle" report={meeting} canUpload={false} />
            )}
            <MeetingNegotiationCard
              meeting={meeting}
              negotiation={meeting.negotiation}
              readOnly
              setActionError={setActionError}
              onChanged={refreshBundle}
            />
            <ClosedDossierNote />
          </div>
        ) : (
          <ClosedDossierNote>Aucune réunion planifiée - dossier clos.</ClosedDossierNote>
        )
      ) : !letterReturned && !meeting ? (
        <p className="text-anac-muted text-sm">
          La réunion formelle sera planifiable une fois la lettre de demande officielle revenue
          signée et scannée dans AIDN.
        </p>
      ) : !meeting ? (
        scheduling ? (
          <form onSubmit={scheduleForm.handleSubmit(onSchedule)} className="space-y-3">
            <div>
              <label className="label">Date et heure</label>
              <input
                type="datetime-local"
                className="input"
                {...scheduleForm.register('dateTime')}
                required
              />
            </div>
            <div>
              <label className="label">Lieu (optionnel)</label>
              <input className="input" {...scheduleForm.register('location')} />
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
              Planifier la réunion formelle
            </Button>
            {!canManage && <p className="text-anac-muted text-xs">Action réservée à la DN.</p>}
          </div>
        )
      ) : rescheduling ? (
        <form onSubmit={rescheduleForm.handleSubmit(onReschedule)} className="space-y-3">
          <div>
            <label className="label">Nouvelle date et heure</label>
            <input
              type="datetime-local"
              className="input"
              {...rescheduleForm.register('dateTime')}
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

          {/* SESSION1-MEET-1 - confirmation state, counter-proposal, history. */}
          <MeetingNegotiationCard
            meeting={meeting}
            negotiation={meeting.negotiation}
            readOnly={!canManage}
            onReschedule={() => setRescheduling(true)}
            setActionError={setActionError}
            onChanged={refreshBundle}
          />

          {/* Held / absent / cancel only once the appointment is confirmed. */}
          {meeting.status === 'scheduled' && isOperationallyConfirmed(meeting.negotiation) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {/* Generated HTML page (not a stored file): opened as before, relative to the API proxy. */}
              <a
                href={`/api/meetings/${meeting.id}/ticket`}
                target="_blank"
                rel="noreferrer"
                title="Ticket de réunion formelle"
                className="btn-secondary text-xs inline-flex items-center gap-1 px-2 py-1 rounded"
              >
                Voir le ticket
              </a>
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
            <MeetingReportRows
              title="Réunion formelle"
              report={meeting}
              canUpload={canManage}
              busy={busy}
              onUpload={(file) => sendReport(meeting.id, file)}
            />
          )}
          {!canManage && meeting.status === 'scheduled' && (
            <p className="text-anac-muted text-xs">Action réservée à la DN.</p>
          )}
        </div>
      )}
    </CollapsibleCard>
  );
}
