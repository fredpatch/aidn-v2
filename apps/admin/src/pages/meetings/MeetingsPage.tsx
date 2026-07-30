import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  List,
  MapPin,
  RotateCcw,
  Search,
  Upload,
  UsersRound,
  XCircle,
} from 'lucide-react';
import { Button, buttonVariants } from '../../components/ui/button';
import { apiErrorMessage } from '../../lib/axios';
import {
  attachMeetingReport,
  fetchMeetingCockpit,
  markMeetingStatus,
  rescheduleMeeting,
  uploadMeetingFile,
} from '../../lib/api/meetings.api';
import type {
  MeetingCockpitItem,
  MeetingCockpitMetric,
  MeetingPhaseFilter,
  MeetingStatusFilter,
  MeetingTypeFilter,
} from '../../lib/api/meetings.types';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { cn } from '../../lib/utils';

type ViewMode = 'calendar' | 'list';

const API_ORIGIN = 'http://localhost:4000';
const WORK_HOURS = Array.from({ length: 10 }, (_, index) => index + 8);

const TYPE_OPTIONS: Array<{ value: MeetingTypeFilter; label: string }> = [
  { value: 'all', label: 'Tous les types' },
  { value: 'preliminary', label: 'Preliminaire' },
  { value: 'formal', label: 'Formelle' },
  { value: 'site_visit', label: 'Visite sur site' },
];

const STATUS_OPTIONS: Array<{ value: MeetingStatusFilter; label: string }> = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'scheduled', label: 'Planifiees' },
  { value: 'held', label: 'Tenues' },
  { value: 'no_show', label: 'Absences' },
  { value: 'rescheduled', label: 'Reprogrammees' },
  { value: 'file_cancelled', label: 'Dossiers annules' },
];

const PHASE_OPTIONS: Array<{ value: MeetingPhaseFilter; label: string }> = [
  { value: 'all', label: 'Toutes les phases' },
  { value: 'M3', label: 'Preliminaire' },
  { value: 'M4', label: 'Demande formelle' },
  { value: 'M6', label: 'Inspection' },
];

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'border-blue-100 bg-blue-50 text-anac-blue',
  held: 'border-green-100 bg-green-50 text-anac-success',
  no_show: 'border-orange-100 bg-orange-50 text-anac-warning',
  rescheduled: 'border-slate-200 bg-slate-50 text-anac-muted',
  file_cancelled: 'border-red-100 bg-red-50 text-anac-danger',
};

const TYPE_STYLES: Record<string, string> = {
  preliminary: 'border-blue-200 bg-blue-50 text-anac-blue',
  formal: 'border-violet-200 bg-violet-50 text-violet-700',
  site_visit: 'border-orange-200 bg-orange-50 text-anac-warning',
};

export default function MeetingsPage() {
  const [view, setView] = useState<ViewMode>('calendar');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [meetingType, setMeetingType] = useState<MeetingTypeFilter>('all');
  const [status, setStatus] = useState<MeetingStatusFilter>('all');
  const [phaseCode, setPhaseCode] = useState<MeetingPhaseFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const from = weekStart.toISOString();
  const to = weekEnd.toISOString();

  const query = useQuery({
    queryKey: queryKeys.meetings.cockpit(from, to, meetingType, status, phaseCode),
    queryFn: () => fetchMeetingCockpit({ from, to, meetingType, status, phaseCode }),
  });

  const filteredItems = useMemo(() => {
    const needle = normalize(search);
    return (query.data?.items ?? []).filter((item) =>
      normalize(
        `${item.requestReference} ${item.organisationName} ${item.applicantName} ${item.dnAgentName} ${item.location ?? ''}`
      ).includes(needle)
    );
  }, [query.data?.items, search]);

  const selected =
    filteredItems.find((item) => item.id === selectedId) ??
    filteredItems[0] ??
    query.data?.items[0] ??
    null;

  return (
    <div className="-m-6 min-h-full bg-[#f8fafc] text-anac-text">
      <main className="mx-auto max-w-[1500px] space-y-4 px-6 py-5">
        <MeetingsHeader
          view={view}
          onViewChange={setView}
          onToday={() => setWeekStart(startOfWeek(new Date()))}
        />

        {actionError ? (
          <div className="rounded-lg border border-anac-danger/20 bg-red-50 px-4 py-3 text-sm text-anac-danger">
            {actionError}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(query.data?.metrics ?? fallbackMetrics()).map((metric) => (
            <MeetingMetricCard key={metric.key} metric={metric} />
          ))}
        </section>

        <section className="overflow-hidden rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)]">
          <MeetingFilters
            meetingType={meetingType}
            status={status}
            phaseCode={phaseCode}
            search={search}
            weekStart={weekStart}
            weekEnd={weekEnd}
            onTypeChange={setMeetingType}
            onStatusChange={setStatus}
            onPhaseChange={setPhaseCode}
            onSearchChange={setSearch}
            onPreviousWeek={() => setWeekStart(addDays(weekStart, -7))}
            onNextWeek={() => setWeekStart(addDays(weekStart, 7))}
          />

          <div className="grid min-h-[420px] xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 border-b border-anac-border xl:border-b-0 xl:border-r">
              {query.isLoading ? (
                <EmptyState
                  title="Chargement du calendrier"
                  description="Recuperation des reunions planifiees."
                />
              ) : query.error ? (
                <EmptyState
                  title="Chargement impossible"
                  description="Impossible de charger les reunions."
                  danger
                />
              ) : view === 'calendar' ? (
                <WeekCalendar
                  weekStart={weekStart}
                  items={filteredItems}
                  selectedId={selected?.id ?? null}
                  onSelect={(item) => {
                    setSelectedId(item.id);
                    setActionError(null);
                  }}
                />
              ) : (
                <MeetingsTable
                  items={filteredItems}
                  selectedId={selected?.id ?? null}
                  onSelect={(item) => {
                    setSelectedId(item.id);
                    setActionError(null);
                  }}
                />
              )}
            </div>

            <UpcomingRail
              items={query.data?.upcoming ?? []}
              selectedId={selected?.id ?? null}
              onSelect={(item) => {
                setSelectedId(item.id);
                setActionError(null);
              }}
            />
          </div>
        </section>

        <SelectedMeetingPanel item={selected} setActionError={setActionError} />
      </main>
    </div>
  );
}

function MeetingsHeader({
  view,
  onViewChange,
  onToday,
}: {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onToday: () => void;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-medium text-anac-muted">Direction de la Navigabilite</p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-semibold leading-tight text-anac-navy">Reunions</h1>
          <div className="inline-flex rounded-lg border border-anac-border bg-white p-1">
            <ViewButton
              active={view === 'calendar'}
              icon={CalendarDays}
              onClick={() => onViewChange('calendar')}
            >
              Calendrier
            </ViewButton>
            <ViewButton active={view === 'list'} icon={List} onClick={() => onViewChange('list')}>
              Liste
            </ViewButton>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onToday}>
          Aujourd'hui
        </Button>
        <Button
          type="button"
          disabled
          title="La planification reste lancee depuis la phase du dossier."
        >
          Planifier depuis le dossier
        </Button>
      </div>
    </header>
  );
}

function ViewButton({
  active,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: typeof CalendarDays;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-semibold transition',
        active ? 'bg-anac-blue/10 text-anac-blue' : 'text-anac-muted hover:text-anac-navy'
      )}
    >
      <Icon size={14} aria-hidden="true" />
      {children}
    </button>
  );
}

function MeetingMetricCard({ metric }: { metric: MeetingCockpitMetric }) {
  const iconMap = {
    scheduled: CalendarDays,
    today: Clock3,
    missing_reports: FileText,
    held: CheckCircle2,
  };
  const Icon = iconMap[metric.key as keyof typeof iconMap] ?? CalendarDays;
  return (
    <section className="rounded-lg border border-anac-border bg-white p-3.5 shadow-[0_8px_22px_rgba(17,34,83,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-anac-muted">{metric.label}</p>
          <p className="mt-1.5 text-[24px] font-semibold leading-none text-anac-navy">
            {metric.value}
          </p>
        </div>
        <div className={cn('rounded-lg border p-2.5', toneClass(metric.tone))}>
          <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-3 text-[11px] text-anac-muted">{metric.helper}</p>
    </section>
  );
}

function MeetingFilters({
  meetingType,
  status,
  phaseCode,
  search,
  weekStart,
  weekEnd,
  onTypeChange,
  onStatusChange,
  onPhaseChange,
  onSearchChange,
  onPreviousWeek,
  onNextWeek,
}: {
  meetingType: MeetingTypeFilter;
  status: MeetingStatusFilter;
  phaseCode: MeetingPhaseFilter;
  search: string;
  weekStart: Date;
  weekEnd: Date;
  onTypeChange: (value: MeetingTypeFilter) => void;
  onStatusChange: (value: MeetingStatusFilter) => void;
  onPhaseChange: (value: MeetingPhaseFilter) => void;
  onSearchChange: (value: string) => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-anac-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Type de reunion"
          value={meetingType}
          onChange={onTypeChange}
          options={TYPE_OPTIONS}
        />
        <FilterSelect
          label="Phase"
          value={phaseCode}
          onChange={onPhaseChange}
          options={PHASE_OPTIONS}
        />
        <FilterSelect
          label="Statut"
          value={status}
          onChange={onStatusChange}
          options={STATUS_OPTIONS}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block">
          <span className="sr-only">Rechercher une reunion</span>
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
          />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-9 w-[260px] rounded-md border border-anac-border bg-white pl-9 pr-3 text-sm outline-none focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
            placeholder="Dossier, organisme, responsable..."
          />
        </label>
        <div className="inline-flex h-9 items-center overflow-hidden rounded-md border border-anac-border bg-white">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center text-anac-muted hover:bg-anac-gray"
            onClick={onPreviousWeek}
            aria-label="Semaine precedente"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-[170px] border-x border-anac-border px-3 text-center text-xs font-semibold text-anac-navy">
            {formatDate(weekStart)} - {formatDate(addDays(weekEnd, -1))}
          </span>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center text-anac-muted hover:bg-anac-gray"
            onClick={onNextWeek}
            aria-label="Semaine suivante"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="inline-flex h-9 items-center gap-2 rounded-md border border-anac-border bg-white px-3 text-xs text-anac-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="bg-transparent text-xs font-semibold text-anac-navy outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function WeekCalendar({
  weekStart,
  items,
  selectedId,
  onSelect,
}: {
  weekStart: Date;
  items: MeetingCockpitItem[];
  selectedId: number | null;
  onSelect: (item: MeetingCockpitItem) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  if (items.length === 0) {
    return (
      <EmptyState
        title="Aucune reunion sur cette semaine"
        description="Modifiez les filtres ou selectionnez une autre semaine."
      />
    );
  }

  return (
    <div className="overflow-x-auto p-3">
      <div className="min-w-[840px] overflow-hidden rounded-lg border border-anac-border">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-14" />
            {days.map((day) => (
              <col key={day.toISOString()} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-slate-50">
              <th className="border-b border-r border-anac-border px-2 py-2" aria-label="Heure" />
              {days.map((day) => (
                <th
                  key={day.toISOString()}
                  className="border-b border-r border-anac-border px-2 py-2 text-center last:border-r-0"
                >
                  <span className="text-xs font-semibold text-anac-navy">
                    {day.toLocaleDateString('fr-FR', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WORK_HOURS.map((hour) => (
              <tr key={hour} className="h-[52px] border-b border-anac-border last:border-b-0">
                <th
                  scope="row"
                  className="w-14 border-r border-anac-border px-2 py-2 text-center align-top text-[11px] font-semibold text-anac-muted"
                >
                  {String(hour).padStart(2, '0')}:00
                </th>
                {days.map((day) => {
                  const dayItems = items.filter((item) => isSameDayHour(item.scheduledAt, day, hour));
                  return (
                    <td
                      key={`${day.toISOString()}-${hour}`}
                      className="h-[52px] border-r border-anac-border p-1 align-top last:border-r-0"
                    >
                      <div className="space-y-1">
                        {dayItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelect(item)}
                            className={cn(
                              'w-full rounded-md border px-2 py-1 text-left text-[10.5px] leading-tight transition hover:shadow-sm',
                              TYPE_STYLES[item.meetingType] ?? TYPE_STYLES.preliminary,
                              selectedId === item.id && 'ring-2 ring-anac-blue/30'
                            )}
                          >
                            <span className="block font-semibold">
                              {formatTime(item.scheduledAt)} - {item.meetingTypeLabel}
                            </span>
                            <span className="mt-0.5 block truncate text-anac-navy">
                              {item.organisationName}
                            </span>
                          </button>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MeetingsTable({
  items,
  selectedId,
  onSelect,
}: {
  items: MeetingCockpitItem[];
  selectedId: number | null;
  onSelect: (item: MeetingCockpitItem) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Aucune reunion dans cette vue"
        description="Modifiez les filtres ou revenez plus tard."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="border-b border-anac-border bg-slate-50 text-left text-[11px] uppercase tracking-wide text-anac-muted">
          <tr>
            <th className="px-4 py-3 font-semibold">Dossier</th>
            <th className="px-4 py-3 font-semibold">Organisme</th>
            <th className="px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Date</th>
            <th className="px-4 py-3 font-semibold">Responsable</th>
            <th className="px-4 py-3 font-semibold">Statut</th>
            <th className="px-4 py-3 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-anac-border">
          {items.map((item) => (
            <tr
              key={item.id}
              onClick={() => onSelect(item)}
              className={cn(
                'cursor-pointer hover:bg-anac-blue/5',
                selectedId === item.id && 'bg-anac-blue/5'
              )}
            >
              <td className="px-4 py-3 font-semibold text-anac-navy">{item.requestReference}</td>
              <td className="px-4 py-3">{item.organisationName}</td>
              <td className="px-4 py-3">{item.meetingTypeLabel}</td>
              <td className="px-4 py-3">{formatDateTime(item.scheduledAt)}</td>
              <td className="px-4 py-3">{item.dnAgentName}</td>
              <td className="px-4 py-3">
                <StatusBadge item={item} />
              </td>
              <td className="px-4 py-3 text-xs font-semibold text-anac-blue">{item.actionLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UpcomingRail({
  items,
  selectedId,
  onSelect,
}: {
  items: MeetingCockpitItem[];
  selectedId: number | null;
  onSelect: (item: MeetingCockpitItem) => void;
}) {
  return (
    <aside className="bg-white p-3">
      <h2 className="text-sm font-semibold text-anac-navy">Prochaines reunions</h2>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <EmptyState
            title="Aucune reunion prevue"
            description="Aucun creneau planifie dans la periode."
            compact
          />
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                'w-full rounded-lg border-l-4 border-y border-r bg-white p-2.5 text-left transition hover:bg-anac-blue/5',
                typeBorder(item.meetingType),
                selectedId === item.id && 'bg-anac-blue/5'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-anac-navy">{item.meetingTypeLabel}</p>
                  <p className="mt-1 text-xs text-anac-muted">{formatDateTime(item.scheduledAt)}</p>
                  <p className="mt-1 text-xs text-anac-muted">
                    {item.location ?? item.requestReference}
                  </p>
                </div>
                <StatusBadge item={item} />
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function SelectedMeetingPanel({
  item,
  setActionError,
}: {
  item: MeetingCockpitItem | null;
  setActionError: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [reportFile, setReportFile] = useState<File | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'held' | 'no_show' | 'file_cancelled' }) =>
      markMeetingStatus(id, status),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (err) =>
      setActionError(apiErrorMessage(err, 'Impossible de mettre a jour la reunion.')),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: string }) =>
      rescheduleMeeting(id, new Date(value).toISOString()),
    onSuccess: async () => {
      setRescheduleAt('');
      setActionError(null);
      await refresh();
    },
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de reporter la reunion.')),
  });

  const reportMutation = useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const uploaded = await uploadMeetingFile(file);
      await attachMeetingReport(
        id,
        uploaded.fileUrl,
        uploaded.mimeType,
        uploaded.uploadAssetId ?? uploaded.id
      );
    },
    onSuccess: async () => {
      setReportFile(null);
      setActionError(null);
      await refresh();
    },
    onError: (err) =>
      setActionError(apiErrorMessage(err, 'Impossible de joindre le compte-rendu.')),
  });

  async function handleReschedule(event: FormEvent) {
    event.preventDefault();
    if (!item || !rescheduleAt) return;
    await rescheduleMutation.mutateAsync({ id: item.id, value: rescheduleAt });
  }

  async function handleReport(event: FormEvent) {
    event.preventDefault();
    if (!item || !reportFile) return;
    await reportMutation.mutateAsync({ id: item.id, file: reportFile });
  }

  if (!item) {
    return (
      <section className="rounded-lg border border-anac-border bg-white p-6 shadow-sm">
        <EmptyState
          title="Aucune reunion selectionnee"
          description="Selectionnez un creneau dans le calendrier ou la liste."
          compact
        />
      </section>
    );
  }

  const busy = statusMutation.isPending || rescheduleMutation.isPending || reportMutation.isPending;
  const canResolve = item.canManage && item.status === 'scheduled';
  const canReport = item.canManage && item.status === 'held';

  return (
    <section className="rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)]">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div className="border-b border-anac-border p-4 xl:border-b-0 xl:border-r">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-anac-muted">
                  Details de la reunion selectionnee
                </p>
                <StatusBadge item={item} />
              </div>
              <h2 className="mt-2 text-lg font-semibold text-anac-navy">{item.meetingTypeLabel}</h2>
              <p className="mt-1 text-sm text-anac-muted">
                {item.organisationName} - {item.requestReference}
              </p>
            </div>
            <Link
              to={item.phaseHref}
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-2')}
            >
              Ouvrir le dossier
            </Link>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Info icon={CalendarDays} label="Date" value={formatDateTime(item.scheduledAt)} />
            <Info icon={MapPin} label="Lieu" value={item.location ?? 'Non renseigne'} />
            <Info icon={UsersRound} label="Responsable" value={item.dnAgentName} />
            <Info icon={FileText} label="Phase" value={item.phaseLabel} />
          </div>

          <div className="mt-4 rounded-lg border border-anac-border bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-anac-navy">Ordre du jour</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-anac-muted">
              <li>Point d'avancement du dossier {item.requestReference}</li>
              <li>Validation des actions ouvertes</li>
              <li>Planning des prochaines etapes</li>
            </ul>
          </div>
        </div>

        <aside className="p-4">
          <h3 className="text-sm font-semibold text-anac-navy">Actions</h3>
          <div className="mt-3 space-y-2.5">
            <a
              href={`${API_ORIGIN}${item.ticketUrl}`}
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({ variant: 'secondary' }),
                'w-full justify-center gap-2'
              )}
            >
              <FileText size={14} />
              Voir le ticket
            </a>

            {canResolve ? (
              <div className="grid gap-2">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => statusMutation.mutate({ id: item.id, status: 'held' })}
                >
                  <CheckCircle2 size={14} />
                  Enregistrer la tenue
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => statusMutation.mutate({ id: item.id, status: 'no_show' })}
                >
                  <XCircle size={14} />
                  Absence constatee
                </Button>
              </div>
            ) : null}

            {item.canManage && item.status === 'scheduled' ? (
              <form
                onSubmit={handleReschedule}
                className="rounded-lg border border-anac-border p-3"
              >
                <label className="text-xs font-semibold text-anac-muted" htmlFor="reschedule-at">
                  Reporter la reunion
                </label>
                <input
                  id="reschedule-at"
                  type="datetime-local"
                  value={rescheduleAt}
                  onChange={(event) => setRescheduleAt(event.target.value)}
                  className="mt-2 h-9 w-full rounded-md border border-anac-border px-3 text-sm outline-none focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  className="mt-2 w-full"
                  disabled={!rescheduleAt || busy}
                >
                  <RotateCcw size={14} />
                  Reporter
                </Button>
              </form>
            ) : null}

            {canReport ? (
              <form onSubmit={handleReport} className="rounded-lg border border-anac-border p-3">
                <label className="text-xs font-semibold text-anac-muted" htmlFor="meeting-report">
                  Compte-rendu
                </label>
                {item.crDocumentUrl ? (
                  <a
                    href={`${API_ORIGIN}${item.crDocumentUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block text-xs font-semibold text-anac-blue underline"
                  >
                    Consulter le compte-rendu actuel
                  </a>
                ) : null}
                <input
                  id="meeting-report"
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(event) => setReportFile(event.target.files?.[0] ?? null)}
                  className="mt-2 text-xs"
                />
                <Button type="submit" className="mt-2 w-full" disabled={!reportFile || busy}>
                  <Upload size={14} />
                  {item.crDocumentUrl ? 'Remplacer le compte-rendu' : 'Ajouter le compte-rendu'}
                </Button>
              </form>
            ) : null}

            {!item.canManage ? (
              <div className="rounded-lg border border-anac-border bg-slate-50 p-3 text-xs text-anac-muted">
                Cette visite est suivie ici en lecture. Les actions R3 restent disponibles dans Mes
                inspections.
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-anac-border bg-white p-2.5">
      <p className="flex items-center gap-2 text-xs font-semibold text-anac-muted">
        <Icon size={14} aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1.5 text-sm font-semibold text-anac-navy">{value}</p>
    </div>
  );
}

function StatusBadge({ item }: { item: MeetingCockpitItem }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        STATUS_STYLES[item.status] ?? STATUS_STYLES.scheduled
      )}
    >
      {item.statusLabel}
    </span>
  );
}

function EmptyState({
  title,
  description,
  danger = false,
  compact = false,
}: {
  title: string;
  description: string;
  danger?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid place-items-center px-4 py-8 text-center',
        compact ? 'min-h-[140px]' : 'min-h-[360px]'
      )}
    >
      <div>
        <p className={cn('font-semibold', danger ? 'text-anac-danger' : 'text-anac-navy')}>
          {title}
        </p>
        <p className="mt-1 text-sm text-anac-muted">{description}</p>
      </div>
    </div>
  );
}

function fallbackMetrics(): MeetingCockpitMetric[] {
  return [
    {
      key: 'scheduled',
      label: 'Reunions prevues',
      value: '-',
      helper: 'Creneaux planifies sur la periode',
      tone: 'info',
    },
    {
      key: 'today',
      label: "Aujourd'hui",
      value: '-',
      helper: 'Reunions au calendrier du jour',
      tone: 'info',
    },
    {
      key: 'missing_reports',
      label: 'Comptes-rendus manquants',
      value: '-',
      helper: 'Reunions tenues sans compte-rendu',
      tone: 'info',
    },
    {
      key: 'held',
      label: 'Reunions tenues',
      value: '-',
      helper: 'Reunions marquees tenues',
      tone: 'info',
    },
  ];
}

function toneClass(tone: MeetingCockpitMetric['tone']): string {
  if (tone === 'success') return 'border-green-100 bg-green-50 text-anac-success';
  if (tone === 'warning') return 'border-orange-100 bg-orange-50 text-anac-warning';
  if (tone === 'danger') return 'border-red-100 bg-red-50 text-anac-danger';
  return 'border-blue-100 bg-blue-50 text-anac-blue';
}

function typeBorder(type: string): string {
  if (type === 'formal') return 'border-l-violet-500 border-y-anac-border border-r-anac-border';
  if (type === 'site_visit') return 'border-l-orange-500 border-y-anac-border border-r-anac-border';
  return 'border-l-anac-blue border-y-anac-border border-r-anac-border';
}

function startOfWeek(value: Date): Date {
  const date = new Date(value);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function isSameDayHour(value: string, day: Date, hour: number): boolean {
  const date = new Date(value);
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate() &&
    date.getHours() === hour
  );
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
