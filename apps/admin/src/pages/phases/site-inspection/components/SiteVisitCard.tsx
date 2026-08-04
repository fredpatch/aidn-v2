import { useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { SITE_VISIT_STATUS_LABELS, SITE_VISIT_STATUS_TONES } from '../constants';
import { formatDateTime } from '../helpers';
import { useR3Agents, useSiteVisitActions } from '../hooks/useSiteVisitActions';
import type { SiteVisitView } from '../types';
import PhaseStatusBadge from '../../preliminary/components/PhaseStatusBadge';

const scheduleSchema = z.object({
  r3AgentId: z.string().min(1, 'Merci de sélectionner un agent R3.'),
  scheduledAt: z.string(),
  location: z.string().optional(),
});

type ScheduleFormValues = z.infer<typeof scheduleSchema>;

interface SiteVisitCardProps {
  phaseId: number;
  siteVisit: SiteVisitView | null;
  requestId: string | undefined;
  invoiceSent: boolean;
  canScheduleVisit: boolean;
  canMarkHeld: boolean;
  setActionError: (message: string | null) => void;
}

export default function SiteVisitCard({
  phaseId,
  siteVisit,
  requestId,
  invoiceSent,
  canScheduleVisit,
  canMarkHeld,
  setActionError,
}: SiteVisitCardProps) {
  const [scheduling, setScheduling] = useState(false);

  const { agents, loading: loadingAgents } = useR3Agents();
  const { busy, schedule, markHeld } = useSiteVisitActions(requestId, setActionError);
  const { register, handleSubmit, reset } = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: { r3AgentId: '', scheduledAt: '', location: '' },
  });

  async function onSubmit(values: ScheduleFormValues) {
    const ok = await schedule({
      phaseId,
      r3AgentId: Number(values.r3AgentId),
      scheduledAt: values.scheduledAt,
      location: values.location,
    });
    if (ok) {
      setScheduling(false);
      reset();
    }
  }

  function onInvalid(errors: FieldErrors<ScheduleFormValues>) {
    setActionError(errors.r3AgentId?.message ?? null);
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock size={16} className="text-anac-navy" />
        <span className="font-medium text-sm">Visite sur site</span>
      </div>

      {!siteVisit ? (
        !invoiceSent ? (
          <p className="text-anac-muted text-xs">
            La facture doit être envoyée avant de planifier la visite.
          </p>
        ) : canScheduleVisit && scheduling ? (
          <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-3">
            <div>
              <label className="label">Agent R3</label>
              <select className="input" {...register('r3AgentId')} required>
                <option value="">
                  {loadingAgents ? 'Chargement...' : 'Sélectionner un agent'}
                </option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName} ({a.employeeCode})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Date et heure</label>
              <input type="datetime-local" className="input" {...register('scheduledAt')} required />
            </div>
            <div>
              <label className="label">Lieu (optionnel)</label>
              <input className="input" {...register('location')} />
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
        ) : canScheduleVisit ? (
          <Button size="sm" onClick={() => setScheduling(true)}>
            Planifier la visite
          </Button>
        ) : (
          <p className="text-anac-muted text-xs">Visite en attente de planification par la DN.</p>
        )
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            {formatDateTime(siteVisit.scheduledAt)}
            {siteVisit.location && ` - ${siteVisit.location}`}
          </p>

          <PhaseStatusBadge
            status={siteVisit.status}
            label={SITE_VISIT_STATUS_LABELS[siteVisit.status] ?? siteVisit.status}
            toneMap={SITE_VISIT_STATUS_TONES}
          />

          {siteVisit.status === 'scheduled' && canMarkHeld && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => markHeld(siteVisit.id)}
              disabled={busy}
              className="gap-1"
            >
              <CheckCircle2 size={12} /> Marquer comme tenue
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
