import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  FileText,
  Inbox,
  Printer,
  Send,
} from 'lucide-react';
import type { ElementType } from 'react';
import { useState } from 'react';
import { buttonVariants } from '../../components/ui/button';
import { fetchReceptionDashboardSummary } from '../../lib/api/dashboard.api';
import type {
  DashboardPeriod,
  ReceptionDashboardActivityItem,
  ReceptionDashboardAlert,
  ReceptionDashboardCourrierItem,
  ReceptionDashboardFlowStep,
  ReceptionDashboardMetric,
  ReceptionDashboardProgressMetric,
} from '../../lib/api/dashboard.types';
import { cn } from '../../lib/utils';
import { DashboardSection } from './components/DashboardSection';
import { EmptyDashboardState } from './components/EmptyDashboardState';
import { PeriodFilter } from './components/PeriodFilter';
import { formatDateTime } from './dashboard.helpers';

const METRIC_ICONS: Record<string, ElementType> = {
  courriers_to_print: Printer,
  waiting_signature: FileSignature,
  returned_this_period: ClipboardCheck,
  average_signature_return: FileText,
};

const TONE_STYLES = {
  info: 'border-blue-100 bg-blue-50 text-anac-blue',
  warning: 'border-orange-100 bg-orange-50 text-anac-warning',
  success: 'border-green-100 bg-green-50 text-anac-success',
  danger: 'border-red-100 bg-red-50 text-anac-danger',
};

const PRIORITY_STYLES = {
  haute: 'border-red-100 bg-red-50 text-anac-danger',
  moyenne: 'border-orange-100 bg-orange-50 text-anac-warning',
  basse: 'border-green-100 bg-green-50 text-anac-success',
};

export default function ReceptionDashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('this_month');
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-reception-summary', period],
    queryFn: () => fetchReceptionDashboardSummary(period),
  });

  if (isLoading) {
    return <div className="text-sm text-anac-muted">Chargement du tableau de bord accueil...</div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-anac-danger/20 bg-white p-4 text-sm text-anac-danger">
        Impossible de charger le tableau de bord accueil.
      </div>
    );
  }

  return (
    <div className="-m-6 min-h-full bg-[#f8fafc] text-anac-text">
      <main className="mx-auto max-w-[1480px] space-y-5 px-6 py-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-anac-muted">Direction de la Navigabilite</p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight text-anac-navy">
              Tableau de bord - Accueil & Circuit signature
            </h1>
            <p className="mt-1 text-sm text-anac-muted">
              Suivez les courriers a imprimer, les retours signes et les blocages d'entree.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
            <Link to="/courriers" className={cn(buttonVariants({ size: 'sm' }), 'gap-2')}>
              <Inbox size={14} aria-hidden="true" />
              Ouvrir les courriers
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data.metrics.map((metric) => (
            <ReceptionMetricCard key={metric.key} metric={metric} />
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr_1.15fr]">
          <ReceptionPriorityActions items={data.priorityActions} />
          <ReceptionFlowSummary flow={data.flow} updatedAt={data.updatedAt} />
          <ReceptionQueueCard
            title="3. Courriers a imprimer"
            description="Documents deposes a ouvrir, imprimer et placer en signature."
            items={data.toPrint}
            empty="Aucun courrier a imprimer."
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr_1.15fr]">
          <ReceptionQueueCard
            title="4. Retours signes attendus"
            description="Courriers en signature dont le scan retour est attendu."
            items={data.waitingSignature}
            empty="Aucun retour signe en attente."
          />
          <ReceptionAlerts alerts={data.alerts} />
          <ReceptionActivity activity={data.activity} />
        </section>

        <ReceptionPeriodProgress items={data.periodProgress} updatedAt={data.updatedAt} />
      </main>
    </div>
  );
}

function ReceptionMetricCard({ metric }: { metric: ReceptionDashboardMetric }) {
  const Icon = METRIC_ICONS[metric.key] ?? FileText;
  return (
    <DashboardSection className="min-h-[138px] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-anac-muted">{metric.label}</p>
          <p className="mt-2 text-[26px] font-semibold leading-none text-anac-navy">
            {metric.value}
          </p>
        </div>
        <div className={cn('rounded-lg border p-2.5', TONE_STYLES[metric.tone])}>
          <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-4 text-[11px] text-anac-muted">{metric.helper}</p>
    </DashboardSection>
  );
}

function ReceptionPriorityActions({ items }: { items: ReceptionDashboardCourrierItem[] }) {
  return (
    <DashboardSection
      title="1. Actions prioritaires"
      description="Impression, mise en signature et scan retour a traiter."
      className="p-4"
      action={<Link to="/courriers" className="text-xs font-semibold text-anac-blue">Voir tout</Link>}
    >
      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <EmptyDashboardState
            icon={<CheckCircle2 size={16} aria-hidden="true" />}
            title="Aucune action prioritaire"
            description="Les actions d'accueil et signature urgentes apparaitront ici."
          />
        ) : (
          items.map((item) => <ReceptionActionRow key={item.id} item={item} />)
        )}
      </div>
    </DashboardSection>
  );
}

function ReceptionActionRow({ item }: { item: ReceptionDashboardCourrierItem }) {
  return (
    <div className="grid gap-3 rounded-lg border border-anac-border bg-white px-3 py-2 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-semibold text-anac-navy">{item.nextAction}</p>
        <p className="truncate text-xs text-anac-muted">
          {item.requestReference} - {item.organisationName}
        </p>
        <p className="truncate text-[11px] text-anac-muted">
          {item.sourceLabel} - {item.waitingLabel}
        </p>
      </div>
      <span className={cn('w-fit rounded-full border px-2 py-0.5 text-[11px] font-semibold', PRIORITY_STYLES[item.priority])}>
        {item.priority}
      </span>
      <Link to={item.href} className="text-xs font-semibold text-anac-blue">
        Traiter
      </Link>
    </div>
  );
}

function ReceptionFlowSummary({
  flow,
  updatedAt,
}: {
  flow: ReceptionDashboardFlowStep[];
  updatedAt: string;
}) {
  const icons = [FileText, Send, FileSignature, ClipboardCheck];
  return (
    <DashboardSection
      title="2. Flux signature"
      description="Lecture rapide du circuit physique des courriers."
      className="p-4"
    >
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {flow.map((step, index) => {
          const Icon = icons[index] ?? FileText;
          return (
            <div key={step.key} className="relative text-center">
              {index < flow.length - 1 ? (
                <span className="absolute left-1/2 right-[-50%] top-5 hidden h-px bg-anac-border sm:block" />
              ) : null}
              <div className={cn('relative mx-auto grid h-10 w-10 place-items-center rounded-full border bg-white', TONE_STYLES[step.tone])}>
                <Icon size={16} aria-hidden="true" />
              </div>
              <p className="mt-3 text-xs font-semibold text-anac-navy">{step.label}</p>
              <p className="mt-1 min-h-8 text-[11px] leading-snug text-anac-muted">{step.description}</p>
              <span className={cn('mt-2 inline-flex rounded px-2 py-0.5 text-xs font-semibold', TONE_STYLES[step.tone])}>
                {step.count}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-5 border-t border-anac-border pt-3 text-[11px] text-anac-muted">
        Derniere mise a jour : {formatDateTime(updatedAt)}
      </p>
    </DashboardSection>
  );
}

function ReceptionQueueCard({
  title,
  description,
  items,
  empty,
}: {
  title: string;
  description: string;
  items: ReceptionDashboardCourrierItem[];
  empty: string;
}) {
  return (
    <DashboardSection
      title={title}
      description={description}
      className="p-4"
      action={<Link to="/courriers" className="text-xs font-semibold text-anac-blue">Voir tout</Link>}
    >
      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <EmptyDashboardState
            icon={<CheckCircle2 size={16} aria-hidden="true" />}
            title={empty}
            description="La liste se remplira automatiquement selon le circuit signature."
          />
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              to={item.href}
              className="grid gap-2 rounded-lg border border-anac-border bg-white px-3 py-2 text-sm transition hover:bg-anac-blue/5 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-anac-navy">
                  {item.requestReference}
                </span>
                <span className="block truncate text-xs text-anac-muted">
                  {item.organisationName} - {item.sourceLabel}
                </span>
              </span>
              <span className="text-xs font-semibold text-anac-blue">{item.statusLabel}</span>
            </Link>
          ))
        )}
      </div>
    </DashboardSection>
  );
}

function ReceptionAlerts({ alerts }: { alerts: ReceptionDashboardAlert[] }) {
  return (
    <DashboardSection
      title="5. Alertes et blocages"
      description="Retards qui bloquent l'entree ou la phase formelle."
      className="p-4"
      action={<Link to="/courriers" className="text-xs font-semibold text-anac-blue">Voir tout</Link>}
    >
      <div className="mt-4 space-y-2">
        {alerts.map((alert) => (
          <Link
            key={alert.key}
            to={alert.href ?? '/courriers'}
            className={cn('flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm', TONE_STYLES[alert.tone])}
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={14} aria-hidden="true" />
                {alert.title}
              </span>
              <span className="mt-1 block truncate text-[11px] opacity-80">{alert.helper}</span>
            </span>
            <span className="text-base font-semibold">{alert.value}</span>
          </Link>
        ))}
      </div>
    </DashboardSection>
  );
}

function ReceptionActivity({ activity }: { activity: ReceptionDashboardActivityItem[] }) {
  return (
    <DashboardSection title="6. Activite recente" description="Evenements metier du circuit." className="p-4">
      <div className="mt-4 space-y-3">
        {activity.length === 0 ? (
          <EmptyDashboardState
            icon={<FileText size={16} aria-hidden="true" />}
            title="Aucune activite recente"
            description="Les actions du circuit signature apparaitront ici."
          />
        ) : (
          activity.map((item) => (
            <div key={item.id} className="flex gap-3 text-sm">
              <span className={cn('mt-1 h-2.5 w-2.5 rounded-full ring-4', TONE_STYLES[item.tone])} />
              <span className="min-w-0">
                <span className="block font-semibold text-anac-navy">{item.title}</span>
                <span className="block truncate text-xs text-anac-muted">
                  {item.requestReference ?? 'Circuit'} {item.organisationName ? `- ${item.organisationName}` : ''}
                </span>
                <span className="block text-[11px] text-anac-muted">
                  {formatDateTime(item.createdAt)} par {item.actor}
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </DashboardSection>
  );
}

function ReceptionPeriodProgress({
  items,
  updatedAt,
}: {
  items: ReceptionDashboardProgressMetric[];
  updatedAt: string;
}) {
  return (
    <DashboardSection title="7. Progression periode" className="p-4">
      <div className="grid gap-5 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-semibold text-anac-navy">{item.label}</p>
              <p className="text-anac-muted">{item.value}</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn(
                  'h-full rounded-full',
                  item.tone === 'success' && 'bg-anac-success',
                  item.tone === 'warning' && 'bg-anac-warning',
                  item.tone === 'danger' && 'bg-anac-danger',
                  item.tone === 'info' && 'bg-anac-blue'
                )}
                style={{ width: `${Math.min(item.percentage, 100)}%` }}
              />
            </div>
            {item.helper ? <p className="mt-2 text-[11px] text-anac-muted">{item.helper}</p> : null}
          </div>
        ))}
      </div>
      <p className="mt-5 border-t border-anac-border pt-3 text-[11px] text-anac-muted">
        Donnees mises a jour le {formatDateTime(updatedAt)}.
      </p>
    </DashboardSection>
  );
}
