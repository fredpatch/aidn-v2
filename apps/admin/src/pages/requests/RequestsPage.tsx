import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArcElement, Chart as ChartJS, Legend as ChartLegend, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import {
  Activity,
  AlertTriangle,
  ArrowDownAZ,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  FolderOpen,
  Inbox,
  MoreVertical,
  Search,
  Send,
  UserRound,
} from 'lucide-react';
import { Button, buttonVariants } from '../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Pagination, paginate } from '../../components/ui/pagination';
import { apiErrorMessage } from '../../lib/axios';
import { fetchRequestCockpit, startPreliminaryPhase } from '../../lib/api/requests.api';
import type {
  RequestCockpitItem,
  RequestCockpitMetric,
  RequestCockpitPhase,
} from '../../lib/api/requests.types';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { cn } from '../../lib/utils';

ChartJS.register(ArcElement, Tooltip, ChartLegend);

type Bucket = 'all' | 'new' | 'review' | 'waiting_dg' | 'closed';
type SortKey = 'newest' | 'oldest' | 'reference';

const BUCKETS: Array<{ key: Bucket; label: string }> = [
  { key: 'all', label: 'Toutes' },
  { key: 'new', label: 'Nouvelles' },
  { key: 'review', label: 'A examiner' },
  { key: 'waiting_dg', label: 'En attente DG' },
  { key: 'closed', label: 'Cloturees' },
];

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'newest', label: 'Date de depot' },
  { key: 'oldest', label: 'Plus anciennes' },
  { key: 'reference', label: 'Reference' },
];

const PAGE_SIZE = 5;

const STATUS_STYLES: Record<string, string> = {
  submitted: 'border-blue-100 bg-blue-50 text-anac-blue',
  pending_review: 'border-green-100 bg-green-50 text-anac-success',
  in_progress: 'border-blue-100 bg-blue-50 text-anac-blue',
  completed: 'border-green-100 bg-green-50 text-anac-success',
  rejected: 'border-red-100 bg-red-50 text-anac-danger',
  cancelled: 'border-slate-200 bg-slate-50 text-anac-muted',
};

const TONE_STYLES = {
  info: 'border-blue-100 bg-blue-50 text-anac-blue',
  warning: 'border-orange-100 bg-orange-50 text-anac-warning',
  success: 'border-green-100 bg-green-50 text-anac-success',
  danger: 'border-red-100 bg-red-50 text-anac-danger',
};

export default function RequestsPage() {
  const [bucket, setBucket] = useState<Bucket>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  function updateBucket(value: Bucket) {
    setBucket(value);
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateSort(value: SortKey) {
    setSort(value);
    setPage(1);
  }

  const query = useQuery({
    queryKey: queryKeys.requests.cockpit(),
    queryFn: fetchRequestCockpit,
  });

  const filtered = useMemo(() => {
    const needle = normalize(search);
    return (query.data?.items ?? [])
      .filter((item) => {
        if (bucket === 'new') return item.status === 'pending_review';
        if (bucket === 'review') return ['pending_review', 'in_progress'].includes(item.status);
        if (bucket === 'waiting_dg') {
          return ['submitted', 'in_signature_circuit', 'signed'].includes(item.circuitStatus ?? '');
        }
        if (bucket === 'closed') return item.status === 'completed';
        return true;
      })
      .filter((item) =>
        normalize(
          `${item.reference} ${item.organisationName} ${item.applicantName} ${item.requestTypeLabel} ${item.currentPhaseLabel}`
        ).includes(needle)
      )
      .sort((a, b) => {
        if (sort === 'oldest') return dateMs(a.createdAt) - dateMs(b.createdAt);
        if (sort === 'reference') return a.reference.localeCompare(b.reference);
        return dateMs(b.createdAt) - dateMs(a.createdAt);
      });
  }, [bucket, query.data?.items, search, sort]);

  const { pageItems, totalPages, page: currentPage } = paginate(filtered, page, PAGE_SIZE);

  const selected =
    filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? query.data?.items[0] ?? null;

  const counts = useMemo(() => {
    const items = query.data?.items ?? [];
    return {
      all: items.length,
      new: items.filter((item) => item.status === 'pending_review').length,
      review: items.filter((item) => ['pending_review', 'in_progress'].includes(item.status))
        .length,
      waiting_dg: items.filter((item) =>
        ['submitted', 'in_signature_circuit', 'signed'].includes(item.circuitStatus ?? '')
      ).length,
      closed: items.filter((item) => item.status === 'completed').length,
    };
  }, [query.data?.items]);

  return (
    <div className="-m-6 min-h-full bg-[#f8fafc] text-anac-text">
      <main className="mx-auto max-w-[1540px] space-y-5 px-6 py-6">
        <RequestsHeader search={search} onSearchChange={updateSearch} />

        {actionError ? (
          <div className="rounded-lg border border-anac-danger/20 bg-red-50 px-4 py-3 text-sm text-anac-danger">
            {actionError}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(query.data?.metrics ?? fallbackMetrics()).map((metric) => (
            <MetricCard key={metric.key} metric={metric} />
          ))}
        </section>

        <section className="grid items-start gap-5 xl:grid-cols-[minmax(520px,0.86fr)_minmax(720px,1.14fr)]">
          <div className="min-w-0 overflow-hidden rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)]">
            <BucketTabs value={bucket} counts={counts} onChange={updateBucket} />
            <ListToolbar
              search={search}
              sort={sort}
              onSearchChange={updateSearch}
              onSortChange={updateSort}
            />
            <RequestsList
              items={pageItems}
              selectedId={selected?.id ?? null}
              loading={query.isLoading}
              error={!!query.error}
              onSelect={(item) => {
                setSelectedId(item.id);
                setActionError(null);
              }}
            />
            <Pagination
              label={`${filtered.length} demande${filtered.length > 1 ? 's' : ''}`}
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>

          <RequestDetailPanel item={selected} setActionError={setActionError} />
        </section>
      </main>
    </div>
  );
}

function RequestsHeader({
  search,
  onSearchChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xs font-medium text-anac-muted">Direction de la Navigabilite</p>
        <h1 className="mt-2 text-2xl font-semibold leading-tight text-anac-navy">Demandes</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block">
          <span className="sr-only">Rechercher une demande</span>
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-10 w-[360px] rounded-lg border border-anac-border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
            placeholder="Rechercher une demande, un dossier, une organisation..."
          />
        </label>
        <Button type="button" variant="secondary" disabled>
          Filtres
        </Button>
        <Button
          type="button"
          disabled
          title="La nouvelle demande se fait depuis le portail ou le guichet autorise."
        >
          Nouvelle demande
        </Button>
      </div>
    </header>
  );
}

function MetricCard({ metric }: { metric: RequestCockpitMetric }) {
  const iconMap = {
    new: Inbox,
    in_review: FileText,
    waiting_dg: Clock3,
    closed: ClipboardCheck,
  };
  const Icon = iconMap[metric.key as keyof typeof iconMap] ?? Inbox;
  return (
    <section className="rounded-lg border border-anac-border bg-white p-4 shadow-[0_8px_22px_rgba(17,34,83,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-anac-muted">{metric.label}</p>
          <p className="mt-2 text-[26px] font-semibold leading-none text-anac-navy">
            {metric.value}
          </p>
        </div>
        <div className={cn('rounded-lg border p-2.5', TONE_STYLES[metric.tone])}>
          <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-4 text-[11px] text-anac-muted">{metric.helper}</p>
    </section>
  );
}

function BucketTabs({
  value,
  counts,
  onChange,
}: {
  value: Bucket;
  counts: Record<Bucket, number>;
  onChange: (value: Bucket) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-anac-border px-4 pt-3">
      {BUCKETS.map((bucket) => (
        <button
          key={bucket.key}
          type="button"
          onClick={() => onChange(bucket.key)}
          className={cn(
            'inline-flex min-h-10 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors',
            value === bucket.key
              ? 'border-anac-blue text-anac-blue'
              : 'border-transparent text-anac-muted hover:text-anac-navy'
          )}
        >
          {bucket.label}
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px]',
              value === bucket.key ? 'bg-anac-blue text-white' : 'bg-anac-gray text-anac-muted'
            )}
          >
            {counts[bucket.key]}
          </span>
        </button>
      ))}
    </div>
  );
}

function ListToolbar({
  search,
  sort,
  onSearchChange,
  onSortChange,
}: {
  search: string;
  sort: SortKey;
  onSearchChange: (value: string) => void;
  onSortChange: (value: SortKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-anac-border p-4">
      <label className="relative block min-w-[260px] flex-1">
        <span className="sr-only">Rechercher dans la liste</span>
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
          aria-hidden="true"
        />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-9 w-full rounded-md border border-anac-border bg-white pl-9 pr-3 text-sm outline-none focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
          placeholder="Rechercher dans la liste..."
        />
      </label>
      <Select value={sort} onValueChange={(value) => onSortChange(value as SortKey)}>
        <SelectTrigger className="h-9 w-[190px] gap-2 text-xs font-semibold text-anac-navy">
          <ArrowDownAZ size={14} className="shrink-0 text-anac-muted" aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.key} value={option.key}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RequestsList({
  items,
  selectedId,
  loading,
  error,
  onSelect,
}: {
  items: RequestCockpitItem[];
  selectedId: number | null;
  loading: boolean;
  error: boolean;
  onSelect: (item: RequestCockpitItem) => void;
}) {
  if (loading) {
    return (
      <EmptyState title="Chargement des demandes" description="Recuperation du cockpit dossiers." />
    );
  }
  if (error) {
    return (
      <EmptyState
        title="Chargement impossible"
        description="Impossible de charger les demandes."
        danger
      />
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="Aucune demande dans cette vue"
        description="Modifiez la recherche ou les filtres."
      />
    );
  }

  return (
    <div className="divide-y divide-anac-border">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className={cn(
            'grid w-full grid-cols-[24px_minmax(0,1fr)_130px] gap-3 px-4 py-3 text-left transition hover:bg-anac-blue/5',
            selectedId === item.id &&
              'bg-anac-blue/5 outline outline-1 -outline-offset-1 outline-anac-blue'
          )}
        >
          <StatusDot item={item} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-anac-navy">{item.reference}</p>
              <StatusBadge label={item.statusLabel} status={item.status} />
            </div>
            <p className="mt-0.5 truncate text-sm font-medium text-anac-text">
              {item.organisationName}
            </p>
            <div className="mt-2 grid gap-1 text-xs text-anac-muted sm:grid-cols-2">
              <span>{item.requestTypeLabel}</span>
              <span className="font-semibold text-anac-blue">{item.currentPhaseLabel}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-anac-muted">Prochaine action</p>
            <p className="mt-1 text-xs font-semibold text-anac-blue">{item.nextActionLabel}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function RequestDetailPanel({
  item,
  setActionError,
}: {
  item: RequestCockpitItem | null;
  setActionError: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const startMutation = useMutation({
    mutationFn: (requestId: number) => startPreliminaryPhase(requestId),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.requests.all });
    },
    onError: (err) =>
      setActionError(apiErrorMessage(err, 'Impossible d ouvrir la phase preliminaire.')),
  });

  if (!item) {
    return (
      <aside className="rounded-lg border border-anac-border bg-white p-6 shadow-sm">
        <EmptyState
          title="Aucun dossier selectionne"
          description="Selectionnez une demande dans la liste."
        />
      </aside>
    );
  }

  return (
    <aside className="min-w-0 rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)]">
      <div className="border-b border-anac-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-anac-navy">
              {item.reference} - {item.requestTypeLabel}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge label={item.statusLabel} status={item.status} />
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                  TONE_STYLES[item.nextActionTone]
                )}
              >
                {item.nextActionLabel}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {item.nextActionHref ? (
              <Link
                to={item.nextActionHref}
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-2')}
              >
                <FolderOpen size={14} />
                Ouvrir le dossier
              </Link>
            ) : null}
            <button className="grid h-9 w-9 place-items-center rounded-md border border-anac-border text-anac-muted">
              <MoreVertical size={15} aria-hidden="true" />
              <span className="sr-only">Plus d'actions</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <PanelBlock title="Organisation demandeuse" icon={Building2}>
          <Info label="Nom" value={item.organisationName} />
          <Info label="Responsable" value={item.applicantName} />
          <Info label="Email" value={item.organisationEmail ?? item.applicantEmail} />
          <Info label="Telephone" value={item.organisationPhone ?? item.applicantPhone ?? '-'} />
        </PanelBlock>

        <PanelBlock title="Phase actuelle" icon={ClipboardCheck}>
          <div className="mb-3">
            <span className="rounded-full bg-anac-blue/10 px-2 py-1 text-xs font-semibold text-anac-blue">
              {item.currentPhaseLabel}
            </span>
          </div>
          <PhaseStepper phases={item.phases} />
        </PanelBlock>

        <PanelBlock title="Informations cles" icon={CalendarClock}>
          <Info label="Type de demande" value={item.requestTypeLabel} />
          <Info label="Date de depot" value={formatDateTime(item.createdAt)} />
          <Info label="Circuit signature" value={item.circuitStatusLabel} />
          <Info label="Derniere mise a jour" value={formatDate(item.updatedAt)} />
        </PanelBlock>

        <PanelBlock title="Documents obligatoires" icon={FileText}>
          <DocumentSummary summary={item.documentSummary} />
        </PanelBlock>

        <PanelBlock title="Activite recente" icon={Activity}>
          <ActivityList item={item} />
        </PanelBlock>

        <section
          className={cn(
            'rounded-lg border p-3.5',
            item.status === 'completed'
              ? 'border-green-100 bg-green-50/60'
              : item.nextActionTone === 'danger'
                ? 'border-red-100 bg-red-50/60'
                : 'border-orange-100 bg-orange-50/60'
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'grid h-9 w-9 flex-shrink-0 place-items-center rounded-full',
                item.status === 'completed'
                  ? 'bg-green-100 text-anac-success'
                  : item.nextActionTone === 'danger'
                    ? 'bg-red-100 text-anac-danger'
                    : 'bg-orange-100 text-anac-warning'
              )}
            >
              {item.status === 'completed' ? (
                <CheckCircle2 size={18} aria-hidden="true" />
              ) : (
                <AlertTriangle size={18} aria-hidden="true" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-anac-navy">Prochaine action recommandee</p>
              <p className="mt-1.5 text-sm font-semibold text-anac-navy">{item.nextActionLabel}</p>
              <p className="mt-1 text-xs leading-relaxed text-anac-muted">
                {item.nextActionDescription}
              </p>
            </div>
          </div>
          {item.canStartPreliminary ? (
            <Button
              type="button"
              className="mt-3 w-full"
              disabled={startMutation.isPending}
              onClick={() => startMutation.mutate(item.id)}
            >
              <Send size={14} />
              {startMutation.isPending ? 'Ouverture...' : 'Ouvrir la phase preliminaire'}
            </Button>
          ) : item.status === 'completed' ||
            item.status === 'rejected' ||
            item.status === 'cancelled' ? (
            <Button type="button" className="mt-3 w-full" disabled>
              {item.status === 'completed' ? 'Workflow termine' : 'Aucune action disponible'}
            </Button>
          ) : item.nextActionHref ? (
            <Link
              to={item.nextActionHref}
              className={cn(buttonVariants(), 'mt-3 w-full justify-center')}
            >
              Traiter
            </Link>
          ) : (
            <div className="mt-3 rounded-md border border-orange-100 bg-white px-3 py-2 text-xs text-anac-muted">
              Action suivie en lecture seule depuis ce cockpit.
            </div>
          )}
        </section>
      </div>

      <div className="border-t border-anac-border px-5 py-4">
        <button className="flex w-full items-center justify-between text-sm font-semibold text-anac-navy">
          Notes internes (0)
          <span className="text-anac-muted">A venir</span>
        </button>
      </div>
    </aside>
  );
}

function PanelBlock({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Building2;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-anac-border bg-white p-3.5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-anac-navy">
        <Icon size={15} aria-hidden="true" />
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-anac-muted">{label}</span>
      <span className="text-right font-semibold text-anac-navy">{value}</span>
    </div>
  );
}

function PhaseStepper({ phases }: { phases: RequestCockpitPhase[] }) {
  return (
    <ol className="space-y-2">
      {phases.map((phase, index) => (
        <li key={phase.phaseCode} className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              'grid h-5 w-5 place-items-center rounded-full border text-[10px] font-semibold',
              phase.status === 'closed'
                ? 'border-anac-success bg-anac-success text-white'
                : phase.status === 'open'
                  ? 'border-anac-blue bg-anac-blue text-white'
                  : 'border-anac-border bg-slate-50 text-anac-muted'
            )}
          >
            {phase.status === 'closed' ? <CheckCircle2 size={12} /> : index + 1}
          </span>
          <span
            className={
              phase.status === 'not_started' ? 'text-anac-muted' : 'font-semibold text-anac-navy'
            }
          >
            {phase.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function DocumentSummary({ summary }: { summary: RequestCockpitItem['documentSummary'] }) {
  if (summary.total === 0) {
    return (
      <p className="text-sm text-anac-muted">
        Le dossier documentaire sera suivi a partir de la demande formelle.
      </p>
    );
  }
  const chartData = {
    labels: ['Completes', 'Manquants', 'En attente revue'],
    datasets: [
      {
        data: [summary.completed, summary.missing, summary.pending],
        backgroundColor: ['#16a34a', '#f59e0b', '#cbd5e1'],
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 3,
      },
    ],
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-20 w-20 flex-shrink-0">
        <Doughnut
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (context) => `${context.label}: ${context.parsed}`,
                },
              },
            },
          }}
        />
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <span className="text-sm font-semibold text-anac-navy">
            {summary.completed}/{summary.total}
          </span>
        </div>
      </div>
      <div className="space-y-2 text-xs">
        <Legend color="bg-anac-success" label={`${summary.completed} completes`} />
        <Legend color="bg-anac-warning" label={`${summary.missing} manquants`} />
        <Legend color="bg-slate-300" label={`${summary.pending} en attente revue`} />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <p className="flex items-center gap-2 text-anac-muted">
      <span className={cn('h-2.5 w-2.5 rounded-sm', color)} />
      {label}
    </p>
  );
}

function ActivityList({ item }: { item: RequestCockpitItem }) {
  if (item.activity.length === 0) {
    return <p className="text-sm text-anac-muted">Aucune activite recente disponible.</p>;
  }
  return (
    <ol className="space-y-3">
      {item.activity.map((activity) => (
        <li key={activity.id} className="flex gap-3">
          <span
            className={cn('mt-0.5 h-3 w-3 rounded-full border-2', activityDot(activity.tone))}
          />
          <div>
            <p className="text-xs font-semibold text-anac-navy">{activity.title}</p>
            <p className="text-[11px] text-anac-muted">
              {formatDateTime(activity.createdAt)} par {activity.actor}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function StatusBadge({ label, status }: { label: string; status: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        STATUS_STYLES[status] ?? STATUS_STYLES.in_progress
      )}
    >
      {label}
    </span>
  );
}

function StatusDot({ item }: { item: RequestCockpitItem }) {
  const className =
    item.status === 'completed'
      ? 'border-anac-success text-anac-success'
      : item.nextActionTone === 'warning'
        ? 'border-anac-warning text-anac-warning'
        : 'border-anac-blue text-anac-blue';
  return (
    <span className={cn('mt-1 grid h-5 w-5 place-items-center rounded-full border', className)}>
      {item.status === 'completed' ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
    </span>
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
    <div className="grid min-h-[260px] place-items-center p-6 text-center">
      <div>
        <p className={cn('font-semibold', danger ? 'text-anac-danger' : 'text-anac-navy')}>
          {title}
        </p>
        <p className="mt-1 text-sm text-anac-muted">{description}</p>
      </div>
    </div>
  );
}

function fallbackMetrics(): RequestCockpitMetric[] {
  return [
    {
      key: 'new',
      label: 'Nouvelles',
      value: '-',
      helper: 'Retours signes prets a ouvrir',
      tone: 'info',
    },
    {
      key: 'in_review',
      label: "En cours d'examen",
      value: '-',
      helper: 'Dossiers ouverts ou prets DN',
      tone: 'info',
    },
    {
      key: 'waiting_dg',
      label: 'En attente DG',
      value: '-',
      helper: 'Circuit signature non termine',
      tone: 'info',
    },
    { key: 'closed', label: 'Cloturees', value: '-', helper: 'Dossiers termines', tone: 'info' },
  ];
}

function activityDot(tone: RequestCockpitItem['nextActionTone']): string {
  if (tone === 'success') return 'border-anac-success bg-green-50';
  if (tone === 'warning') return 'border-anac-warning bg-orange-50';
  if (tone === 'danger') return 'border-anac-danger bg-red-50';
  return 'border-anac-blue bg-blue-50';
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function dateMs(value: string): number {
  return new Date(value).getTime();
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('fr-FR');
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
