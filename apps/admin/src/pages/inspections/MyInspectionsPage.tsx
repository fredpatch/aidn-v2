import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  MapPin,
  Search,
  XCircle,
} from 'lucide-react';
import { Button, buttonVariants } from '../../components/ui/button';
import { apiErrorMessage } from '../../lib/axios';
import { markSiteVisitHeld, submitVerdict, fetchMyQueue } from '../../lib/api/site-inspection.api';
import type { MyQueueItem } from '../../lib/api/site-inspection.types';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { cn } from '../../lib/utils';

type StatusFilter = 'all' | MyQueueItem['missionStatus'];
type VerdictValue = 'compliant' | 'non_compliant' | 'compliant_with_reserves';

const STATUS_LABELS: Record<MyQueueItem['missionStatus'], string> = {
  planned: 'Planifiee',
  payment_pending: 'Paiement attendu',
  to_hold: 'Prevue',
  report_due: 'Avis attendu',
  closed: 'Cloturee',
};

const STATUS_STYLES: Record<MyQueueItem['missionStatus'], string> = {
  planned: 'border-blue-100 bg-blue-50 text-anac-blue',
  payment_pending: 'border-orange-100 bg-orange-50 text-anac-warning',
  to_hold: 'border-blue-100 bg-blue-50 text-anac-blue',
  report_due: 'border-red-100 bg-red-50 text-anac-danger',
  closed: 'border-green-100 bg-green-50 text-anac-success',
};

const PRIORITY_STYLES = {
  haute: 'border-red-100 bg-red-50 text-anac-danger',
  moyenne: 'border-orange-100 bg-orange-50 text-anac-warning',
  basse: 'border-green-100 bg-green-50 text-anac-success',
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: 'Reconnaissance',
  issuance: 'Delivrance',
  modification: 'Modification',
  renewal: 'Renouvellement',
};

const VERDICT_LABELS: Record<VerdictValue, string> = {
  compliant: 'Conforme',
  compliant_with_reserves: 'Conforme avec reserves',
  non_compliant: 'Non conforme',
};

export default function MyInspectionsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data = [], isLoading, error } = useQuery({
    queryKey: queryKeys.siteInspection.myQueue(),
    queryFn: fetchMyQueue,
  });

  const days = useMemo(() => buildSevenDayStrip(), []);
  const filtered = useMemo(() => {
    const needle = normalize(search);
    return data.filter((item) => {
      const matchesSearch =
        !needle ||
        normalize(
          `${item.requestReference} ${item.organisationName} ${item.siteVisit?.location ?? ''}`
        ).includes(needle);
      const matchesStatus = status === 'all' || item.missionStatus === status;
      const matchesDay = !selectedDay || dayKey(item.siteVisit?.scheduledAt) === selectedDay;
      return matchesSearch && matchesStatus && matchesDay;
    });
  }, [data, search, selectedDay, status]);

  const selected =
    filtered.find((item) => item.phaseId === selectedId) ?? filtered[0] ?? data[0] ?? null;

  const metrics: Array<{
    key: string;
    label: string;
    value: number;
    helper: string;
    icon: typeof CalendarDays;
    tone: 'info' | 'warning' | 'success';
  }> = [
    {
      key: 'planned',
      label: 'Inspections prevues',
      value: data.filter((item) => item.missionStatus === 'to_hold').length,
      helper: 'Visites planifiees a tenir',
      icon: CalendarDays,
      tone: 'success',
    },
    {
      key: 'ongoing',
      label: 'En cours',
      value: data.filter((item) => ['payment_pending', 'to_hold', 'report_due'].includes(item.missionStatus)).length,
      helper: 'Missions non cloturees',
      icon: ClipboardList,
      tone: 'info',
    },
    {
      key: 'reports',
      label: 'Avis a remettre',
      value: data.filter((item) => item.missionStatus === 'report_due').length,
      helper: 'Visites tenues sans avis',
      icon: FileText,
      tone: 'warning',
    },
    {
      key: 'closed',
      label: 'Cloturees',
      value: data.filter((item) => item.missionStatus === 'closed').length,
      helper: 'Avis R3 deja soumis',
      icon: CheckCircle2,
      tone: 'success',
    },
  ];

  return (
    <div className="-m-6 min-h-full bg-[#f8fafc] text-anac-text">
      <main
        className="mx-auto grid max-w-[1500px] gap-5 px-6 py-6"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(340px, 380px)' }}
      >
        <section className="min-w-0 space-y-5">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-anac-muted">Direction de la Navigabilite</p>
              <h1 className="mt-2 text-2xl font-semibold leading-tight text-anac-navy">
                Mes inspections
              </h1>
              <p className="mt-1 text-sm text-anac-muted">
                Suivez vos missions R3, les visites planifiees et les avis a remettre.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative block">
                <span className="sr-only">Rechercher une inspection</span>
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
                  aria-hidden="true"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-9 w-[280px] rounded-md border border-anac-border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
                  placeholder="Rechercher dossier, operateur, lieu..."
                />
              </label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
                className="h-9 rounded-md border border-anac-border bg-white px-3 text-sm font-medium text-anac-navy outline-none focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
                aria-label="Filtrer par statut"
              >
                <option value="all">Tous les statuts</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </header>

          {actionError ? (
            <div className="rounded-lg border border-anac-danger/20 bg-red-50 px-4 py-3 text-sm text-anac-danger">
              {actionError}
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <MetricCard key={metric.key} metric={metric} />
            ))}
          </section>

          <CalendarStrip
            days={days}
            items={data}
            selectedDay={selectedDay}
            onSelect={(day) => setSelectedDay((current) => (current === day ? null : day))}
          />

          <InspectionTable
            items={filtered}
            selectedId={selected?.phaseId ?? null}
            isLoading={isLoading}
            error={!!error}
            onSelect={(item) => {
              setSelectedId(item.phaseId);
              setActionError(null);
            }}
          />
        </section>

        <InspectionDetailPanel item={selected} setActionError={setActionError} />
      </main>
    </div>
  );
}

function MetricCard({
  metric,
}: {
  metric: {
    label: string;
    value: number;
    helper: string;
    icon: typeof CalendarDays;
    tone: 'info' | 'warning' | 'success';
  };
}) {
  const Icon = metric.icon;
  const toneClass =
    metric.tone === 'success'
      ? 'border-green-100 bg-green-50 text-anac-success'
      : metric.tone === 'warning'
        ? 'border-orange-100 bg-orange-50 text-anac-warning'
        : 'border-blue-100 bg-blue-50 text-anac-blue';
  return (
    <div className="min-h-[128px] rounded-lg border border-anac-border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-anac-muted">{metric.label}</p>
          <p className="mt-2 text-[26px] font-semibold leading-none text-anac-navy">
            {metric.value}
          </p>
        </div>
        <div className={cn('rounded-lg border p-2.5', toneClass)}>
          <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-4 text-[11px] text-anac-muted">{metric.helper}</p>
    </div>
  );
}

function CalendarStrip({
  days,
  items,
  selectedDay,
  onSelect,
}: {
  days: { key: string; weekday: string; day: string; month: string }[];
  items: MyQueueItem[];
  selectedDay: string | null;
  onSelect: (day: string) => void;
}) {
  return (
    <section className="rounded-lg border border-anac-border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-anac-navy">Prochaines inspections</h2>
          <p className="text-xs text-anac-muted">Volume de missions assignees sur les 7 prochains jours.</p>
        </div>
        {selectedDay ? (
          <button className="text-xs font-semibold text-anac-blue" onClick={() => onSelect(selectedDay)}>
            Voir toute la semaine
          </button>
        ) : null}
      </div>
      <div
        className="grid gap-2 overflow-x-auto pb-1"
        style={{ gridTemplateColumns: 'repeat(7, minmax(118px, 1fr))' }}
      >
        {days.map((day) => {
          const count = items.filter((item) => dayKey(item.siteVisit?.scheduledAt) === day.key).length;
          const active = selectedDay === day.key;
          return (
            <button
              key={day.key}
              onClick={() => onSelect(day.key)}
              className={cn(
                'rounded-lg border px-3 py-3 text-center transition',
                active
                  ? 'border-anac-blue bg-anac-blue/10 text-anac-blue'
                  : 'border-anac-border bg-white text-anac-muted hover:border-anac-blue/40'
              )}
            >
              <span className="block text-[11px] font-semibold uppercase">{day.weekday}</span>
              <span className="block text-[10px] uppercase">{day.month}</span>
              <span className="mt-2 block text-base font-semibold text-anac-navy">{count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function InspectionTable({
  items,
  selectedId,
  isLoading,
  error,
  onSelect,
}: {
  items: MyQueueItem[];
  selectedId: number | null;
  isLoading: boolean;
  error: boolean;
  onSelect: (item: MyQueueItem) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-anac-border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-anac-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-anac-navy">{items.length} inspection(s) trouvee(s)</h2>
          <p className="text-xs text-anac-muted">Cliquez une ligne pour afficher la mission.</p>
        </div>
      </div>

      {isLoading ? (
        <EmptyState title="Chargement des inspections" description="Recuperation de vos missions R3." />
      ) : error ? (
        <EmptyState title="Chargement impossible" description="Impossible de charger la file de dossiers." danger />
      ) : items.length === 0 ? (
        <EmptyState title="Aucune inspection dans cette vue" description="Modifiez les filtres ou revenez plus tard." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="border-b border-anac-border bg-slate-50 text-left text-[11px] uppercase tracking-wide text-anac-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Reference dossier</th>
                <th className="px-4 py-3 font-semibold">Operateur</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Date planifiee</th>
                <th className="px-4 py-3 font-semibold">Lieu</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-anac-border">
              {items.map((item) => (
                <tr
                  key={item.phaseId}
                  className={cn(
                    'cursor-pointer transition hover:bg-anac-blue/5',
                    selectedId === item.phaseId && 'bg-anac-blue/5'
                  )}
                  onClick={() => onSelect(item)}
                >
                  <td className="px-4 py-3 font-semibold text-anac-navy">{item.requestReference}</td>
                  <td className="px-4 py-3">{item.organisationName}</td>
                  <td className="px-4 py-3">{REQUEST_TYPE_LABELS[item.requestType] ?? item.requestType}</td>
                  <td className="px-4 py-3">{formatDateTime(item.siteVisit?.scheduledAt)}</td>
                  <td className="px-4 py-3">{item.siteVisit?.location ?? '-'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge item={item} />
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-anac-blue">{item.nextActionLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function InspectionDetailPanel({
  item,
  setActionError,
}: {
  item: MyQueueItem | null;
  setActionError: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [verdict, setVerdict] = useState<VerdictValue>('compliant');
  const [note, setNote] = useState('');

  const markHeldMutation = useMutation({
    mutationFn: (meetingId: number) => markSiteVisitHeld(meetingId),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.siteInspection.myQueue() });
    },
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de marquer la visite comme tenue.')),
  });

  const verdictMutation = useMutation({
    mutationFn: (params: { phaseId: number; verdict: VerdictValue; note: string }) =>
      submitVerdict(params.phaseId, params.verdict, params.note),
    onSuccess: async () => {
      setNote('');
      setVerdict('compliant');
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.siteInspection.myQueue() });
    },
    onError: (err) => setActionError(apiErrorMessage(err, "Impossible de soumettre l'avis R3.")),
  });

  async function handleVerdictSubmit(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    if (!note.trim()) {
      setActionError("La note est obligatoire pour soumettre l'avis R3.");
      return;
    }
    await verdictMutation.mutateAsync({ phaseId: item.phaseId, verdict, note });
  }

  if (!item) {
    return (
      <aside className="rounded-lg border border-anac-border bg-white p-5 shadow-sm">
        <EmptyState title="Aucune mission selectionnee" description="Selectionnez une inspection dans la liste." />
      </aside>
    );
  }

  const canMarkHeld = item.nextAction === 'mark_held' && !!item.siteVisit;
  const canSubmitVerdict = item.nextAction === 'submit_verdict';
  const busy = markHeldMutation.isPending || verdictMutation.isPending;

  return (
    <aside className="h-fit rounded-lg border border-anac-border bg-white shadow-sm xl:sticky xl:top-6">
      <div className="border-b border-anac-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-anac-muted">Inspection selectionnee</p>
            <h2 className="mt-2 text-xl font-semibold text-anac-navy">{item.requestReference}</h2>
            <p className="mt-1 text-sm text-anac-muted">{item.organisationName}</p>
          </div>
          <StatusBadge item={item} />
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-anac-muted">
          <CalendarDays size={14} aria-hidden="true" />
          {formatDateTime(item.siteVisit?.scheduledAt)}
        </p>
        <p className="mt-1 flex items-center gap-2 text-xs text-anac-muted">
          <MapPin size={14} aria-hidden="true" />
          {item.siteVisit?.location ?? 'Lieu non renseigne'}
        </p>
      </div>

      <div className="space-y-4 p-5">
        <PanelBlock title="Details de la mission" icon={ClipboardList}>
          <Info label="Type de demande" value={REQUEST_TYPE_LABELS[item.requestType] ?? item.requestType} />
          <Info label="Paiement" value={paymentLabel(item.payment?.status)} />
          <Info label="Visite" value={visitLabel(item.siteVisit?.status)} />
          <Info label="Avis R3" value={item.inspection ? verdictLabel(item.inspection.verdict) : 'Attendu'} />
        </PanelBlock>

        <PanelBlock title="Avancement" icon={ClipboardCheck}>
          <ProgressStep label="Paiement valide" done={item.payment?.status === 'validated'} />
          <ProgressStep label="Visite tenue" done={item.siteVisit?.status === 'held'} />
          <ProgressStep label="Avis R3 soumis" done={!!item.inspection} />
        </PanelBlock>

        {item.inspection ? (
          <PanelBlock title="Avis soumis" icon={FileText}>
            <p className="text-sm font-semibold text-anac-navy">{verdictLabel(item.inspection.verdict)}</p>
            <p className="mt-1 text-xs text-anac-muted">Soumis le {formatDateTime(item.inspection.submittedAt)}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-anac-text">{item.inspection.note}</p>
          </PanelBlock>
        ) : canSubmitVerdict ? (
          <form onSubmit={handleVerdictSubmit} className="rounded-lg border border-anac-border p-4">
            <h3 className="text-sm font-semibold text-anac-navy">Soumettre l'avis R3</h3>
            <label className="mt-3 block text-xs font-semibold text-anac-muted" htmlFor="r3-verdict">
              Verdict
            </label>
            <select
              id="r3-verdict"
              value={verdict}
              onChange={(event) => setVerdict(event.target.value as VerdictValue)}
              className="mt-1 h-9 w-full rounded-md border border-anac-border bg-white px-3 text-sm outline-none focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
            >
              {Object.entries(VERDICT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label className="mt-3 block text-xs font-semibold text-anac-muted" htmlFor="r3-note">
              Note
            </label>
            <textarea
              id="r3-note"
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 w-full rounded-md border border-anac-border bg-white px-3 py-2 text-sm outline-none focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
              required
            />
            <Button type="submit" className="mt-3 w-full" disabled={busy}>
              {busy ? 'Soumission...' : "Soumettre l'avis"}
            </Button>
          </form>
        ) : (
          <div className="rounded-lg border border-anac-border bg-slate-50 p-4 text-sm text-anac-muted">
            {blockedReason(item)}
          </div>
        )}

        <div className="grid gap-2">
          {canMarkHeld ? (
            <Button
              type="button"
              onClick={() => item.siteVisit && markHeldMutation.mutate(item.siteVisit.id)}
              disabled={busy}
            >
              {busy ? 'Mise a jour...' : 'Enregistrer la tenue'}
            </Button>
          ) : null}
          <Link
            to={`/demandes/${item.requestId}/demonstration-inspection`}
            className={cn(buttonVariants({ variant: 'secondary' }), 'justify-center')}
          >
            Ouvrir la mission
          </Link>
        </div>
      </div>
    </aside>
  );
}

function StatusBadge({ item }: { item: MyQueueItem }) {
  return (
    <span className={cn('inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-semibold', STATUS_STYLES[item.missionStatus])}>
      {item.statusLabel || STATUS_LABELS[item.missionStatus]}
    </span>
  );
}

function PanelBlock({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof ClipboardList;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-anac-border p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-anac-navy">
        <Icon size={14} aria-hidden="true" />
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-anac-muted">{label}</span>
      <span className="text-right font-semibold text-anac-navy">{value}</span>
    </div>
  );
}

function ProgressStep({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckCircle2 size={14} className="text-anac-success" aria-hidden="true" />
      ) : (
        <XCircle size={14} className="text-anac-muted" aria-hidden="true" />
      )}
      <span className={done ? 'text-anac-navy' : 'text-anac-muted'}>{label}</span>
    </div>
  );
}

function EmptyState({
  title,
  description,
  danger = false,
}: {
  title: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <div className="grid min-h-[150px] place-items-center px-4 py-8 text-center">
      <div>
        <p className={cn('font-semibold', danger ? 'text-anac-danger' : 'text-anac-navy')}>{title}</p>
        <p className="mt-1 text-sm text-anac-muted">{description}</p>
      </div>
    </div>
  );
}

function buildSevenDayStrip() {
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return {
      key: dayKey(date.toISOString()) ?? '',
      weekday: date.toLocaleDateString('fr-FR', { weekday: 'short' }),
      day: date.toLocaleDateString('fr-FR', { day: '2-digit' }),
      month: date.toLocaleDateString('fr-FR', { month: 'short' }),
    };
  });
}

function dayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function paymentLabel(status: string | undefined): string {
  if (status === 'validated') return 'Valide';
  if (status === 'awaiting_invoice') return 'Facture attendue';
  if (status === 'awaiting_proof') return 'Preuve attendue';
  if (status === 'pending_validation') return 'Validation S5 attendue';
  if (status === 'rejected') return 'Rejete';
  return 'Non initialise';
}

function visitLabel(status: string | undefined): string {
  if (status === 'scheduled') return 'Planifiee';
  if (status === 'held') return 'Tenue';
  if (status === 'rescheduled') return 'Reprogrammee';
  if (status === 'no_show') return 'Absence';
  if (status === 'file_cancelled') return 'Dossier annule';
  return '-';
}

function verdictLabel(verdict: string): string {
  return VERDICT_LABELS[verdict as VerdictValue] ?? verdict;
}

function blockedReason(item: MyQueueItem): string {
  if (item.nextAction === 'wait_payment') {
    return 'Le paiement doit etre valide par S5 avant la tenue operationnelle et l avis R3.';
  }
  if (item.missionStatus === 'to_hold') {
    return 'La visite doit etre marquee tenue avant de soumettre un avis.';
  }
  return 'Aucune action R3 immediate sur cette mission.';
}
