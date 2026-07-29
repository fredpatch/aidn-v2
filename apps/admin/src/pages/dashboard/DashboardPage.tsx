import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  CreditCard,
  FileText,
  FolderOpen,
  Inbox,
  Mail,
  Plus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { Button, buttonVariants } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { fetchDashboardSummary } from '../../lib/api/dashboard.api';
import type {
  DashboardActionItem,
  DashboardActivityItem,
  DashboardAlert,
  DashboardMeetingItem,
  DashboardMetric,
  DashboardPeriod,
  DashboardPerformanceMetric,
  DashboardPhaseStat,
  DashboardStatusStat,
} from '../../lib/api/dashboard.types';

const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: 'this_month', label: 'Ce mois' },
  { value: 'last_30_days', label: '30 derniers jours' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'year', label: 'Annee' },
];

const METRIC_ICONS: Record<string, React.ElementType> = {
  active_requests: Inbox,
  opened_dossiers: FolderOpen,
  average_global_duration: Clock,
  pending_dg_mail: Mail,
  pending_payments: CreditCard,
};

const TONE_STYLES = {
  success: 'text-anac-success bg-green-50 border-green-100',
  warning: 'text-anac-warning bg-orange-50 border-orange-100',
  danger: 'text-anac-danger bg-red-50 border-red-100',
  info: 'text-anac-blue bg-blue-50 border-blue-100',
  muted: 'text-anac-muted bg-slate-50 border-slate-100',
};

const PRIORITY_STYLES: Record<DashboardActionItem['priority'], string> = {
  haute: 'bg-red-50 text-anac-danger border-red-100',
  moyenne: 'bg-orange-50 text-anac-warning border-orange-100',
  basse: 'bg-green-50 text-anac-success border-green-100',
};

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)]',
        className
      )}
    >
      {children}
    </section>
  );
}

function MetricCard({ metric }: { metric: DashboardMetric }) {
  const Icon = METRIC_ICONS[metric.key] ?? BarChart3;
  const TrendIcon = metric.trend?.direction === 'down' ? TrendingDown : TrendingUp;

  return (
    <Card className="min-h-[112px] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-anac-muted">{metric.label}</p>
          <p className="mt-2 text-[26px] font-semibold leading-none text-anac-navy">
            {metric.value}
          </p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-anac-blue">
          <Icon size={18} strokeWidth={1.8} />
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-anac-muted">{metric.helper}</span>
        {metric.trend ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold',
              TONE_STYLES[metric.trend.tone]
            )}
          >
            <TrendIcon size={12} />
            {metric.trend.value}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function WorkflowOverview({ phases }: { phases: DashboardPhaseStat[] }) {
  return (
    <Card className="p-5">
      <div>
        <h2 className="text-sm font-semibold text-anac-navy">Vue d&apos;ensemble du workflow</h2>
        <p className="text-[12px] text-anac-muted">
          Repartition par phase ouverte et duree moyenne.
        </p>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-5">
        {phases.map((phase, index) => (
          <div key={phase.phaseCode} className="relative min-w-0">
            {index < phases.length - 1 ? (
              <div
                className={cn(
                  'absolute left-[52%] right-[-48%] top-3.5 hidden h-px sm:block',
                  phase.count > 0 ? 'bg-anac-blue' : 'bg-anac-border'
                )}
              />
            ) : null}
            <div className="relative z-10 flex flex-col items-start gap-2 sm:items-center">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border bg-white text-[12px] font-semibold',
                  phase.count > 0
                    ? 'border-anac-success bg-green-50 text-anac-success'
                    : 'border-anac-border text-anac-muted'
                )}
              >
                {phase.count > 0 ? <CheckCircle2 size={16} /> : index + 1}
              </div>
              <div className="text-left sm:text-center">
                <p className="text-[12px] font-semibold text-anac-navy">{phase.label}</p>
                <p className="mt-2 text-lg font-semibold leading-none text-anac-navy">
                  {phase.count}
                </p>
                <p className="mt-1 text-[11px] text-anac-muted">{phase.percentage}%</p>
                <p className="text-[11px] text-anac-blue">
                  {phase.averageDurationDays === null ? '-' : `${phase.averageDurationDays} j`}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StatusDistribution({ items }: { items: DashboardStatusStat[] }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-anac-navy">Repartition des dossiers</h2>
      <p className="text-[12px] text-anac-muted">Par statut courant.</p>

      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-anac-muted">Aucun dossier a afficher.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.status}
              className="grid grid-cols-[112px_1fr_76px] items-center gap-3 text-[12px]"
            >
              <span className="inline-flex items-center gap-2 font-medium text-anac-navy">
                <Circle
                  size={12}
                  className={cn(
                    item.status === 'completed'
                      ? 'text-anac-success'
                      : item.status === 'rejected' || item.status === 'cancelled'
                        ? 'text-anac-danger'
                        : item.status === 'pending_review'
                          ? 'text-anac-warning'
                          : 'text-anac-blue'
                  )}
                />
                {item.label}
              </span>
              <div className="h-1.5 rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-anac-sky"
                  style={{ width: `${Math.max(item.percentage, 4)}%` }}
                />
              </div>
              <span className="text-right text-anac-muted">
                {item.count} - {item.percentage}%
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function ActionQueue({ actions }: { actions: DashboardActionItem[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-anac-navy">Prochaines actions requises</h2>
          <p className="text-[12px] text-anac-muted">Files DN, signature et paiement a traiter.</p>
        </div>
        <Link to="/demandes" className="text-[12px] font-semibold text-anac-blue hover:underline">
          Tout voir
        </Link>
      </div>

      <div className="mt-4 divide-y divide-anac-border">
        {actions.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-anac-success">
            <CheckCircle2 size={16} />
            Aucune action bloquante pour le moment.
          </div>
        ) : (
          actions.map((action) => (
            <div
              key={action.id}
              className="grid grid-cols-[1fr_auto] gap-3 py-2.5 sm:grid-cols-[128px_1fr_auto_auto]"
            >
              <div className="hidden items-center gap-2 text-[11px] text-anac-muted sm:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-anac-blue">
                  {action.owner.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <p className="font-semibold text-anac-navy">{action.owner}</p>
                  <p>{action.dossierReference}</p>
                </span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-anac-navy">{action.title}</p>
                <p className="text-[11px] text-anac-muted">
                  {action.dossierReference} - {formatDateTime(action.submittedAt)}
                </p>
              </div>
              <span
                className={cn(
                  'h-fit rounded-full border px-2 py-1 text-[11px] font-semibold capitalize',
                  PRIORITY_STYLES[action.priority]
                )}
              >
                {action.priority}
              </span>
              {action.href ? (
                <Link
                  to={action.href}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-anac-blue hover:underline"
                >
                  Traiter
                  <ArrowRight size={13} />
                </Link>
              ) : null}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function MeetingsCard({ meetings }: { meetings: DashboardMeetingItem[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <CalendarDays size={16} className="text-anac-blue" />
        <h2 className="text-sm font-semibold text-anac-navy">Reunions planifiees</h2>
      </div>
      <div className="mt-4 space-y-3">
        {meetings.length === 0 ? (
          <p className="text-sm text-anac-muted">Aucune reunion sur les 7 prochains jours.</p>
        ) : (
          meetings.map((meeting) => (
            <div
              key={meeting.id}
              className="flex items-start justify-between gap-3 border-b border-anac-border pb-3 last:border-0 last:pb-0"
            >
              <div className="flex gap-3">
                <CalendarDays size={16} className="mt-0.5 text-anac-blue" />
                <div>
                  <p className="text-sm font-medium text-anac-navy">{meeting.title}</p>
                  <p className="text-[12px] text-anac-muted">{meeting.requestReference}</p>
                  <p className="text-[12px] text-anac-text">
                    {formatDateTime(meeting.scheduledAt)}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-1 text-[11px] font-semibold',
                  meeting.tag === 'today'
                    ? 'bg-green-50 text-anac-success'
                    : 'bg-blue-50 text-anac-blue'
                )}
              >
                {meeting.tag === 'today' ? "Aujourd'hui" : 'Prevue'}
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function ActivityCard({ activity }: { activity: DashboardActivityItem[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Activity size={16} className="text-anac-blue" />
        <h2 className="text-sm font-semibold text-anac-navy">Activite recente</h2>
      </div>
      <div className="mt-4 space-y-4">
        {activity.length === 0 ? (
          <p className="text-sm text-anac-muted">Aucune activite recente.</p>
        ) : (
          activity.map((item) => (
            <div key={item.id} className="flex gap-3">
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border',
                  TONE_STYLES[item.tone]
                )}
              >
                <Circle size={8} fill="currentColor" />
              </span>
              <div>
                <p className="text-sm font-medium capitalize text-anac-navy">{item.title}</p>
                <p className="text-[12px] text-anac-muted">
                  {item.requestReference ? `${item.requestReference} - ` : ''}
                  {formatDateTime(item.createdAt)} par {item.actor}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function AlertGrid({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-anac-navy">Alertes et blocages</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {alerts.map((alert) => (
          <Link
            key={alert.key}
            to={alert.href ?? '/'}
            className={cn(
              'rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow-sm',
              TONE_STYLES[alert.tone]
            )}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} />
              <p className="text-[12px] font-semibold">{alert.title}</p>
            </div>
            <p className="mt-3 text-xl font-semibold">{alert.value}</p>
            <p className="mt-1 text-[11px] opacity-80">{alert.helper}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function PerformanceCard({ items }: { items: DashboardPerformanceMetric[] }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-anac-navy">Progression globale</h2>
      <div className="mt-5 space-y-4">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
              <span className="font-medium text-anac-navy">{item.label}</span>
              <span className="min-w-[56px] text-right text-anac-muted">{item.value}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100">
              <div
                className={cn(
                  'h-1.5 rounded-full',
                  item.tone === 'success'
                    ? 'bg-anac-success'
                    : item.tone === 'warning'
                      ? 'bg-anac-warning'
                      : 'bg-anac-sky'
                )}
                style={{ width: `${Math.min(Math.max(item.percentage, 2), 100)}%` }}
              />
            </div>
            {item.target ? <p className="mt-1 text-[11px] text-anac-muted">{item.target}</p> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('this_month');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-summary', period],
    queryFn: () => fetchDashboardSummary(period),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-anac-border bg-white p-6 text-sm text-anac-muted">
        Chargement du tableau de bord...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 p-6">
        <h1 className="text-lg font-semibold text-anac-danger">Tableau de bord indisponible</h1>
        <p className="mt-2 text-sm text-anac-muted">Impossible de charger les indicateurs.</p>
        <Button className="mt-4" onClick={() => refetch()}>
          Reessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1580px] space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-medium text-anac-muted">Direction de la Navigabilite</p>
          <h1 className="mt-2 text-2xl font-semibold text-anac-navy">Tableau de bord</h1>
          <p className="mt-1 text-sm text-anac-muted">
            Pilotage des delais, volumes, paiements et points de blocage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="dashboard-period">
            Periode
          </label>
          <select
            id="dashboard-period"
            value={period}
            onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
            className="h-9 rounded-md border border-anac-border bg-white px-3 text-sm font-medium text-anac-navy shadow-sm outline-none focus:border-anac-blue focus:ring-2 focus:ring-blue-100"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Link to="/demandes" className={cn(buttonVariants(), 'h-9 gap-2 px-3')}>
            <Plus size={15} />
            Nouvelle demande
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <WorkflowOverview phases={data.workflow} />
        <StatusDistribution items={data.statusDistribution} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr_1.05fr]">
        <ActionQueue actions={data.actions} />
        <MeetingsCard meetings={data.meetings} />
        <ActivityCard activity={data.activity} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[2fr_1.05fr]">
        <AlertGrid alerts={data.alerts} />
        <PerformanceCard items={data.performance} />
      </div>
    </div>
  );
}
