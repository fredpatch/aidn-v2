import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  Send,
  ShieldCheck,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { buttonVariants } from '../../components/ui/button';
import { fetchS5DashboardSummary } from '../../lib/api/dashboard.api';
import type {
  DashboardPeriod,
  S5DashboardActivityItem,
  S5DashboardAlert,
  S5DashboardFlowStep,
  S5DashboardMetric,
  S5DashboardPaymentItem,
  S5DashboardProgressMetric,
} from '../../lib/api/dashboard.types';
import { cn } from '../../lib/utils';
import { DashboardSection } from './components/DashboardSection';
import { EmptyDashboardState } from './components/EmptyDashboardState';
import { PeriodFilter } from './components/PeriodFilter';
import { formatDateTime } from './dashboard.helpers';

const METRIC_ICONS: Record<string, React.ElementType> = {
  invoices_to_send: FileText,
  proofs_to_check: ShieldCheck,
  validated_payments: CheckCircle2,
  rejected_payments: XCircle,
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

export default function S5DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('this_month');
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-s5-summary', period],
    queryFn: () => fetchS5DashboardSummary(period),
  });

  if (isLoading) {
    return <div className="text-sm text-anac-muted">Chargement du tableau de bord S5...</div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-anac-danger/20 bg-white p-4 text-sm text-anac-danger">
        Impossible de charger le tableau de bord S5.
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
              Tableau de bord - Facturation S5
            </h1>
            <p className="mt-1 text-sm text-anac-muted">
              Suivez les factures, les preuves de paiement, les validations et les blocages.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
            <Link to="/paiements-s5" className={cn(buttonVariants({ size: 'sm' }), 'gap-2')}>
              <WalletCards size={14} aria-hidden="true" />
              Ouvrir l'inbox S5
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data.metrics.map((metric) => (
            <S5MetricCard key={metric.key} metric={metric} />
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr_1.15fr]">
          <S5PriorityActions items={data.priorityActions} />
          <S5FlowSummary flow={data.flow} updatedAt={data.updatedAt} />
          <S5RecentInvoices items={data.recentInvoices} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr_1.15fr]">
          <S5ProofsToApprove items={data.proofsToApprove} />
          <S5Alerts alerts={data.alerts} />
          <S5Activity activity={data.activity} />
        </section>

        <S5MonthlyProgress items={data.monthlyProgress} updatedAt={data.updatedAt} />
      </main>
    </div>
  );
}

function S5MetricCard({ metric }: { metric: S5DashboardMetric }) {
  const Icon = METRIC_ICONS[metric.key] ?? WalletCards;
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
          <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-4 text-[11px] text-anac-muted">{metric.helper}</p>
    </DashboardSection>
  );
}

function S5PriorityActions({ items }: { items: S5DashboardPaymentItem[] }) {
  return (
    <DashboardSection
      title="1. Actions prioritaires"
      description="Factures et preuves qui demandent une action S5."
      className="p-4"
      action={<Link to="/paiements-s5" className="text-xs font-semibold text-anac-blue">Voir tout</Link>}
    >
      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <EmptyDashboardState
            icon={<CheckCircle2 size={16} aria-hidden="true" />}
            title="Aucune action prioritaire"
            description="Les actions S5 urgentes apparaitront ici."
          />
        ) : (
          items.map((item) => <S5ActionRow key={item.id} item={item} />)
        )}
      </div>
    </DashboardSection>
  );
}

function S5ActionRow({ item }: { item: S5DashboardPaymentItem }) {
  return (
    <div className="grid gap-3 rounded-lg border border-anac-border bg-white px-3 py-2 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-semibold text-anac-navy">{item.requestReference}</p>
        <p className="truncate text-xs text-anac-muted">{item.organisationName} - {item.phaseLabel}</p>
      </div>
      <span className={cn('w-fit rounded-full border px-2 py-0.5 text-[11px] font-semibold', PRIORITY_STYLES[item.priority])}>
        {item.priority}
      </span>
      <Link to={item.href} className="text-xs font-semibold text-anac-blue">
        {item.nextAction}
      </Link>
    </div>
  );
}

function S5FlowSummary({ flow, updatedAt }: { flow: S5DashboardFlowStep[]; updatedAt: string }) {
  return (
    <DashboardSection
      title="2. Flux de facturation S5"
      description="Lecture rapide de l'entonnoir de paiement."
      className="p-4"
    >
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {flow.map((step, index) => {
          const Icon = index === 0 ? FileText : index === 1 ? Send : index === 2 ? ShieldCheck : CheckCircle2;
          return (
            <div key={step.key} className="relative text-center">
              {index < flow.length - 1 ? (
                <span className="absolute left-1/2 right-[-50%] top-5 hidden h-px bg-anac-border sm:block" />
              ) : null}
              <div className={cn('relative mx-auto grid h-10 w-10 place-items-center rounded-full border bg-white', TONE_STYLES[step.tone])}>
                <Icon size={17} aria-hidden="true" />
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

function S5RecentInvoices({ items }: { items: S5DashboardPaymentItem[] }) {
  return (
    <DashboardSection
      title="3. Factures recues a transmettre"
      description="Dossiers en attente d'enregistrement de facture."
      className="p-4"
      action={<Link to="/paiements-s5" className="text-xs font-semibold text-anac-blue">Voir tout</Link>}
    >
      <CompactPaymentList items={items} empty="Aucune facture en attente." />
    </DashboardSection>
  );
}

function S5ProofsToApprove({ items }: { items: S5DashboardPaymentItem[] }) {
  return (
    <DashboardSection
      title="4. Preuves de paiement a approuver"
      description="Preuves retournees par les postulants."
      className="p-4"
      action={<Link to="/paiements-s5" className="text-xs font-semibold text-anac-blue">Voir tout</Link>}
    >
      <CompactPaymentList items={items} empty="Aucune preuve a valider." />
    </DashboardSection>
  );
}

function CompactPaymentList({ items, empty }: { items: S5DashboardPaymentItem[]; empty: string }) {
  return (
    <div className="mt-4 space-y-2">
      {items.length === 0 ? (
        <EmptyDashboardState
          icon={<CheckCircle2 size={16} aria-hidden="true" />}
          title={empty}
          description="La liste se remplira automatiquement selon les paiements S5."
        />
      ) : (
        items.map((item) => (
          <Link
            key={item.id}
            to={item.href}
            className="grid gap-2 rounded-lg border border-anac-border bg-white px-3 py-2 text-sm transition hover:bg-anac-blue/5 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold text-anac-navy">{item.requestReference}</span>
              <span className="block truncate text-xs text-anac-muted">{item.organisationName} - {item.waitingLabel}</span>
            </span>
            <span className="text-xs font-semibold text-anac-blue">{item.nextAction}</span>
          </Link>
        ))
      )}
    </div>
  );
}

function S5Alerts({ alerts }: { alerts: S5DashboardAlert[] }) {
  return (
    <DashboardSection title="5. Alertes et blocages" description="Retards et rejets a surveiller." className="p-4">
      <div className="mt-4 space-y-2">
        {alerts.map((alert) => {
          const Icon = alert.tone === 'danger' ? XCircle : alert.tone === 'warning' ? AlertTriangle : Clock3;
          const content = (
            <>
              <div className={cn('grid h-8 w-8 place-items-center rounded-lg border', TONE_STYLES[alert.tone])}>
                <Icon size={15} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-anac-navy">{alert.title}</p>
                <p className="text-[11px] text-anac-muted">{alert.helper}</p>
              </div>
              <span className={cn('rounded px-2 py-0.5 text-xs font-semibold', TONE_STYLES[alert.tone])}>
                {alert.value}
              </span>
            </>
          );
          return alert.href ? (
            <Link key={alert.key} to={alert.href} className="flex items-center gap-3 rounded-lg border border-anac-border bg-white p-3 hover:bg-anac-blue/5">
              {content}
            </Link>
          ) : (
            <div key={alert.key} className="flex items-center gap-3 rounded-lg border border-anac-border bg-white p-3">
              {content}
            </div>
          );
        })}
      </div>
    </DashboardSection>
  );
}

function S5Activity({ activity }: { activity: S5DashboardActivityItem[] }) {
  return (
    <DashboardSection title="6. Activite recente" description="Evenements de paiement S5." className="p-4">
      <div className="mt-4 space-y-3">
        {activity.length === 0 ? (
          <EmptyDashboardState
            icon={<Clock3 size={16} aria-hidden="true" />}
            title="Aucune activite recente"
            description="Les validations, rejets et transmissions S5 apparaitront ici."
          />
        ) : (
          activity.map((item) => (
            <div key={item.id} className="flex gap-3 border-b border-anac-border pb-3 last:border-0">
              <span className={cn('mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full', item.tone === 'success' ? 'bg-anac-success' : item.tone === 'danger' ? 'bg-anac-danger' : item.tone === 'warning' ? 'bg-anac-warning' : 'bg-anac-blue')} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-anac-navy">{item.title}</p>
                <p className="text-[11px] text-anac-muted">
                  {item.requestReference ?? 'Paiement'}{item.organisationName ? ` - ${item.organisationName}` : ''}
                </p>
                <p className="text-[11px] text-anac-muted">{formatDateTime(item.createdAt)} par {item.actor}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardSection>
  );
}

function S5MonthlyProgress({ items, updatedAt }: { items: S5DashboardProgressMetric[]; updatedAt: string }) {
  return (
    <DashboardSection
      title="7. Progression de la periode"
      description="Indicateurs bases sur les actions S5 enregistrees."
      className="p-4"
    >
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1fr_1fr_280px]">
        {items.map((item) => (
          <ProgressItem key={item.label} item={item} />
        ))}
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-xs text-anac-blue">
          <p className="font-semibold">Donnees mises a jour</p>
          <p className="mt-2 text-[11px] leading-relaxed">{formatDateTime(updatedAt)}</p>
          <p className="mt-2 text-[11px] leading-relaxed">
            Les montants ne sont pas affiches tant que le modele paiement ne stocke pas les montants factures.
          </p>
        </div>
      </div>
    </DashboardSection>
  );
}

function ProgressItem({ item }: { item: S5DashboardProgressMetric }) {
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-anac-navy">{item.label}</p>
          <p className="mt-2 text-xl font-semibold text-anac-navy">{item.value}</p>
        </div>
        <span className="text-xs text-anac-muted">{item.percentage}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-anac-gray">
        <div
          className={cn(
            'h-full rounded-full',
            item.tone === 'success'
              ? 'bg-anac-success'
              : item.tone === 'warning'
                ? 'bg-anac-warning'
                : item.tone === 'danger'
                  ? 'bg-anac-danger'
                  : 'bg-anac-blue'
          )}
          style={{ width: `${Math.min(item.percentage, 100)}%` }}
        />
      </div>
      {item.helper ? <p className="mt-2 text-[11px] text-anac-muted">{item.helper}</p> : null}
    </div>
  );
}
