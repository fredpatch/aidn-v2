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
import { MEETING_STATUS_LABELS, MEETING_STATUS_TONES } from '../constants';
import { formatDateTime } from '../helpers';
import { ClosedDossierNote, useDossierReadOnly } from '../../components/DossierReadOnly';
import { useMeetingActions } from '../hooks/useMeetingActions';
import type { MeetingView } from '../types';
import PhaseStatusBadge from './PhaseStatusBadge';

const scheduleSchema = z.object({
  dateTime: z.string(),
  location: z.string().optional(),
});
type ScheduleFormValues = z.infer<typeof scheduleSchema>;

const rescheduleSchema = z.object({
  dateTime: z.string(),
});
type RescheduleFormValues = z.infer<typeof rescheduleSchema>;

interface MeetingCardProps {
  phaseId: number;
  meeting: MeetingView | null;
  dnAgentId: number;
  requestId: string | undefined;
  setActionError: (message: string | null) => void;
}

export default function MeetingCard({
  phaseId,
  meeting,
  dnAgentId,
  requestId,
  setActionError,
}: MeetingCardProps) {
  // K7b - closed dossier: the meeting and its report stay viewable, no action.
  const readOnly = useDossierReadOnly();
  const queryClient = useQueryClient();
  // SESSION1-MEET-1 - negotiation actions refresh this workspace's bundle.
  const refreshBundle = () =>
    requestId ? queryClient.invalidateQueries({ queryKey: queryKeys.preliminary.bundle(requestId) }) : undefined;
  const [scheduling, setScheduling] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const { busy, schedule, reschedule, markStatus, sendReport } = useMeetingActions(
    setActionError,
    requestId
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
      setWarning(
        'Attention : vous avez déjà une autre réunion ce jour-là, à un horaire différent.'
      );
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

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock size={16} className="text-anac-navy" />
        <span className="font-medium text-sm">Réunion préliminaire</span>
      </div>

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
              <MeetingReportRows title="Réunion préliminaire" report={meeting} canUpload={false} />
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
            Planifier la réunion
          </Button>
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
                title="Ticket de réunion préliminaire"
                className="btn-secondary text-xs inline-flex items-center gap-1 px-2 py-1 rounded"
              >
                Voir le ticket
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
            <MeetingReportRows
              title="Réunion préliminaire"
              report={meeting}
              canUpload
              busy={busy}
              onUpload={(file) => sendReport(meeting.id, file)}
            />
          )}
        </div>
      )}
    </div>
  );
}
