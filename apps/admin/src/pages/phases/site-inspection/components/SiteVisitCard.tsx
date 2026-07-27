import { FormEvent, useState } from 'react';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { SITE_VISIT_STATUS_LABELS, SITE_VISIT_STATUS_TONES } from '../constants';
import { formatDateTime } from '../helpers';
import { useR3Agents, useSiteVisitActions } from '../hooks/useSiteVisitActions';
import type { SiteVisitView } from '../types';
import PhaseStatusBadge from '../../preliminary/components/PhaseStatusBadge';

interface SiteVisitCardProps {
  phaseId: number;
  siteVisit: SiteVisitView | null;
  requestId: string | undefined;
  invoiceSent: boolean;
  setActionError: (message: string | null) => void;
}

export default function SiteVisitCard({
  phaseId,
  siteVisit,
  requestId,
  invoiceSent,
  setActionError,
}: SiteVisitCardProps) {
  const [scheduling, setScheduling] = useState(false);
  const [r3AgentId, setR3AgentId] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [location, setLocation] = useState('');

  const { agents, loading: loadingAgents } = useR3Agents();
  const { busy, schedule, markHeld } = useSiteVisitActions(requestId, setActionError);

  async function handleSchedule(e: FormEvent) {
    e.preventDefault();
    if (!r3AgentId) {
      setActionError('Merci de sélectionner un agent R3.');
      return;
    }
    const ok = await schedule({ phaseId, r3AgentId: Number(r3AgentId), scheduledAt: dateTime, location });
    if (ok) {
      setScheduling(false);
      setR3AgentId('');
      setDateTime('');
      setLocation('');
    }
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
        ) : scheduling ? (
          <form onSubmit={handleSchedule} className="space-y-3">
            <div>
              <label className="label">Agent R3</label>
              <select
                className="input"
                value={r3AgentId}
                onChange={(e) => setR3AgentId(e.target.value)}
                required
              >
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
            Planifier la visite
          </Button>
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

          {siteVisit.status === 'scheduled' && (
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
