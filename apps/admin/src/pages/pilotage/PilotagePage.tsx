/** ROLE-ANALYTICS-1F - « Pilotage »: what the user's service did, how much,
 *  how long, and what needs attention, per role domain. Distinct from the
 *  cockpits (what to do now) and from /analytique (global DN view).
 *  Everything shown comes from GET /api/analytics/roles/:domain as is. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowRight, BarChart3, ChevronLeft, ChevronRight, Info, Printer, RefreshCcw } from 'lucide-react';
import type {
  RoleAnalyticsActivity,
  RoleAnalyticsDomain,
  RoleAnalyticsMetric,
  RoleAnalyticsOverview,
  RoleAnalyticsPreset,
  RoleAnalyticsScope,
  RoleAnalyticsWarning,
} from '@aidn/shared';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../hooks/useAuth';
import { apiErrorMessage } from '../../lib/axios';
import { getRoleAnalytics, type RoleAnalyticsQuery } from '../../lib/api/role-analytics.api';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { cn } from '../../lib/utils';
import { pilotageDomains, pilotageScopes } from './pilotage.access';
import {
  DOMAIN_LABELS,
  EVENT_LABELS,
  PERIOD_OPTIONS,
  SCOPE_LABELS,
  WARNING_LABELS,
  actorText,
  caveatText,
  cockpitName,
  formatCalendarDate,
  formatDate,
  formatDateTime,
  formatGeneratedAt,
  formatMetricValue,
  metricCopy,
  previousPeriodText,
  sampleSizeText,
} from './pilotageCopy';

const DEFAULT_PERIOD: RoleAnalyticsPreset = 'this_month';

export default function PilotagePage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const domains = pilotageDomains(roles);
  const [chosenDomain, setChosenDomain] = useState<RoleAnalyticsDomain | null>(null);
  const domain = chosenDomain && domains.includes(chosenDomain) ? chosenDomain : domains[0];
  const scopes = domain ? pilotageScopes(roles, domain) : [];
  const [chosenScope, setChosenScope] = useState<RoleAnalyticsScope>('mine');
  const scope = scopes.includes(chosenScope) ? chosenScope : scopes[0];
  const [period, setPeriod] = useState<RoleAnalyticsPreset>(DEFAULT_PERIOD);
  const [draftDates, setDraftDates] = useState({ from: '', to: '' });
  const [customDates, setCustomDates] = useState<{ from: string; to: string } | null>(null);

  const awaitingDates = period === 'custom' && !customDates;
  const query = {
    domain,
    scope,
    period,
    ...(period === 'custom' && customDates ? customDates : {}),
  };
  const overview = useQuery({
    queryKey: queryKeys.roleAnalytics.overview(query),
    // `enabled` guarantees a domain and a scope.
    queryFn: () => getRoleAnalytics(query as RoleAnalyticsQuery),
    enabled: Boolean(domain && scope) && !awaitingDates,
  });

  if (!domain || !scope) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-anac-border bg-white p-6">
        <h1 className="text-lg font-semibold text-anac-navy">Pilotage indisponible</h1>
        <p className="mt-2 text-sm text-anac-muted">Aucun tableau de pilotage n’est associé à votre rôle.</p>
      </div>
    );
  }

  const canOpenGlobalAnalytics = roles.includes('SU') || roles.includes('dn_supervisor');

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-anac-navy">Pilotage</h1>
          <p className="text-sm text-anac-muted">Activité, délais et alertes de votre périmètre</p>
        </div>
        <div className="flex items-center gap-3">
          {canOpenGlobalAnalytics ? (
            <Link to="/analytique" className="inline-flex items-center gap-1.5 text-sm font-medium text-anac-blue hover:underline">
              <BarChart3 size={14} aria-hidden="true" />
              Voir l’analyse globale
            </Link>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => window.print()} disabled={!overview.data}>
            <Printer size={14} aria-hidden="true" />
            Imprimer
          </Button>
        </div>
      </header>

      <section aria-label="Filtres" className="flex flex-wrap items-center gap-3 rounded-lg border border-anac-border bg-white p-3 shadow-sm print:hidden">
        {domains.length > 1 ? (
          <Segmented
            label="Domaine"
            options={domains.map((value) => ({ value, label: DOMAIN_LABELS[value] }))}
            value={domain}
            onChange={setChosenDomain}
          />
        ) : (
          <span className="rounded-full bg-anac-gray px-3 py-1 text-sm font-semibold text-anac-navy">{DOMAIN_LABELS[domain]}</span>
        )}
        {scopes.length > 1 ? (
          <Segmented
            label="Périmètre"
            options={scopes.map((value) => ({ value, label: SCOPE_LABELS[value] }))}
            value={scope}
            onChange={setChosenScope}
          />
        ) : (
          <span className="text-sm text-anac-muted">{SCOPE_LABELS[scope]}</span>
        )}
        <select
          aria-label="Période"
          value={period}
          onChange={(event) => setPeriod(event.target.value as RoleAnalyticsPreset)}
          className="h-9 rounded-md border border-anac-border bg-white px-3 text-sm font-medium text-anac-navy outline-none focus:border-anac-blue"
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {period === 'custom' ? (
          <form
            className="flex flex-wrap items-center gap-2 text-sm text-anac-muted"
            onSubmit={(event) => {
              event.preventDefault();
              if (draftDates.from && draftDates.to) setCustomDates({ ...draftDates });
            }}
          >
            <span>Du</span>
            <input
              type="date"
              aria-label="Date de début"
              value={draftDates.from}
              onChange={(event) => setDraftDates({ ...draftDates, from: event.target.value })}
              className="h-9 rounded-md border border-anac-border px-2 text-anac-navy"
            />
            <span>au</span>
            <input
              type="date"
              aria-label="Date de fin"
              value={draftDates.to}
              onChange={(event) => setDraftDates({ ...draftDates, to: event.target.value })}
              className="h-9 rounded-md border border-anac-border px-2 text-anac-navy"
            />
            <Button type="submit" size="sm" disabled={!draftDates.from || !draftDates.to}>
              Appliquer
            </Button>
          </form>
        ) : null}
        {overview.data ? (
          <span className="ml-auto text-xs text-anac-muted">
            Du {formatCalendarDate(overview.data.period.displayFrom)} au {formatCalendarDate(overview.data.period.displayTo)}
          </span>
        ) : null}
      </section>

      {awaitingDates ? (
        <p className="rounded-lg border border-anac-border bg-white p-4 text-sm text-anac-muted">
          Choisissez une date de début et une date de fin, puis appliquez.
        </p>
      ) : overview.isLoading ? (
        <div className="rounded-lg border border-anac-border bg-white p-6 text-sm text-anac-muted">Chargement du tableau de pilotage...</div>
      ) : overview.isError || !overview.data ? (
        <LoadError error={overview.error} onRetry={() => overview.refetch()} />
      ) : (
        <OverviewView data={overview.data} />
      )}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-anac-border bg-anac-gray p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded px-3 py-1 text-sm font-medium transition-colors',
            option.value === value ? 'bg-white text-anac-navy shadow-sm' : 'text-anac-muted hover:text-anac-navy'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  let title = 'Pilotage indisponible';
  let message = 'Impossible de charger le tableau de pilotage.';
  if (status === 403) {
    title = 'Accès non autorisé';
    message = 'Vos droits ne permettent pas d’ouvrir ce tableau. Si votre rôle a changé, reconnectez-vous.';
  } else if (status === 400) {
    title = 'Période invalide';
    message = apiErrorMessage(error, 'Vérifiez les dates choisies.');
  } else if (status === 501) {
    title = 'Tableau indisponible';
    message = 'Ce tableau n’est pas encore disponible.';
  }
  return (
    <div role="alert" className="rounded-lg border border-red-100 bg-red-50 p-6">
      <h2 className="text-base font-semibold text-anac-danger">{title}</h2>
      <p className="mt-1 text-sm text-anac-muted">{message}</p>
      {status !== 403 && status !== 400 ? (
        <Button className="mt-3 gap-2" size="sm" onClick={onRetry}>
          <RefreshCcw size={14} aria-hidden="true" />
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}

function OverviewView({ data }: { data: RoleAnalyticsOverview }) {
  const periodMetrics = data.metrics.filter((metric) => metric.basis === 'period');
  const currentMetrics = data.metrics.filter((metric) => metric.basis === 'current');
  const quietPeriod = data.recentActivity.length === 0 && periodMetrics.every((metric) => !metric.value);
  return (
    <>
      <PrintHeader data={data} />
      <MetricSection title="Sur la période" metrics={periodMetrics}>
        {quietPeriod ? <p className="text-sm text-anac-muted">Aucune activité sur cette période.</p> : null}
      </MetricSection>
      {currentMetrics.length ? <MetricSection title="Situation actuelle" metrics={currentMetrics} /> : null}
      {/* items-start: each card keeps its own height (no stretched empty card). */}
      <div className="grid items-start gap-4 lg:grid-cols-2 print:block print:space-y-4">
        <WarningsSection warnings={data.warnings} />
        {/* A new response (domain, scope or period) starts again at page 1. */}
        <ActivitySection
          key={`${data.domain}:${data.scope}:${data.period.start}:${data.period.end}`}
          activity={data.recentActivity}
        />
      </div>
    </>
  );
}

/** Printed report heading: the filters of the response being printed. */
function PrintHeader({ data }: { data: RoleAnalyticsOverview }) {
  const preset = PERIOD_OPTIONS.find((option) => option.value === data.period.preset)?.label;
  return (
    <section aria-label="En-tête d’impression" className="hidden border-b border-black pb-2 text-sm text-black print:block">
      <h1 className="text-lg font-semibold">AIDN — Rapport de pilotage</h1>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3">
        <dt>Périmètre :</dt>
        <dd>{DOMAIN_LABELS[data.domain]}</dd>
        <dt>Vue :</dt>
        <dd>{SCOPE_LABELS[data.scope]}</dd>
        <dt>Période :</dt>
        <dd>
          {preset ? `${preset} — ` : ''}Du {formatCalendarDate(data.period.displayFrom)} au {formatCalendarDate(data.period.displayTo)}
        </dd>
        <dt>Généré le :</dt>
        <dd>{formatGeneratedAt(data.generatedAt)}</dd>
      </dl>
    </section>
  );
}

function MetricSection({ title, metrics, children }: { title: string; metrics: RoleAnalyticsMetric[]; children?: React.ReactNode }) {
  if (!metrics.length) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-anac-muted">{title}</h2>
      {children}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 print:grid-cols-3 print:gap-2">
        {metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </ul>
    </section>
  );
}

function MetricCard({ metric }: { metric: RoleAnalyticsMetric }) {
  const copy = metricCopy(metric.key);
  const Icon = copy.icon;
  const trend = previousPeriodText(metric);
  const sample = sampleSizeText(metric.sampleSize);
  return (
    <li className="rounded-lg border border-anac-border bg-white p-3 shadow-sm print:break-inside-avoid print:border-gray-400 print:p-2 print:shadow-none">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-anac-muted" title={copy.description}>
            {copy.label}
          </p>
          <p className="mt-1 text-2xl font-semibold leading-tight text-anac-navy">{formatMetricValue(metric)}</p>
        </div>
        <Icon size={16} className="mt-0.5 shrink-0 text-anac-blue" aria-hidden="true" />
      </div>
      {trend || sample ? (
        <p className="mt-1 text-[11px] text-anac-muted">{[trend, sample].filter(Boolean).join(' · ')}</p>
      ) : null}
      {metric.reliability === 'caveat' ? (
        <p className="mt-1.5 flex items-start gap-1 text-[11px] text-anac-muted">
          <Info size={12} className="mt-px shrink-0" aria-label="À noter" />
          <span>{caveatText(metric.caveatKey)}</span>
        </p>
      ) : null}
    </li>
  );
}

const SEVERITY_STYLES: Record<RoleAnalyticsWarning['severity'], string> = {
  danger: 'border-l-anac-danger',
  warning: 'border-l-anac-warning',
  info: 'border-l-anac-info',
};

function WarningsSection({ warnings }: { warnings: RoleAnalyticsWarning[] }) {
  return (
    <section
      aria-label="Points d’attention"
      className="rounded-lg border border-anac-border bg-white p-4 shadow-sm print:break-inside-avoid print:border-gray-400 print:p-3 print:shadow-none"
    >
      <h2 className="text-sm font-semibold text-anac-navy">Points d’attention</h2>
      {warnings.length === 0 ? (
        <p className="mt-2 text-sm text-anac-muted">Aucun point d’attention actuellement.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {warnings.map((warning) => (
            <li key={warning.key} className={cn('rounded-md border border-anac-border border-l-4 px-3 py-2', SEVERITY_STYLES[warning.severity])}>
              <p className="text-sm font-semibold text-anac-navy">
                {warning.count} · {WARNING_LABELS[warning.key] ?? 'Point d’attention'}
              </p>
              {warning.oldest ? (
                <p className="text-xs text-anac-muted">
                  Plus ancien : {warning.oldest.requestReference} · depuis le {formatDate(warning.oldest.since)}
                </p>
              ) : null}
              <Link to={warning.href} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-anac-blue hover:underline print:hidden">
                Voir dans {cockpitName(warning.href)}
                <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Activity rows shown per screen page; the printed report lists them all. */
const ACTIVITY_PAGE_SIZE = 5;

function ActivitySection({ activity }: { activity: RoleAnalyticsActivity[] }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(activity.length / ACTIVITY_PAGE_SIZE);
  const visible = activity.slice(page * ACTIVITY_PAGE_SIZE, (page + 1) * ACTIVITY_PAGE_SIZE);
  return (
    <section
      aria-label="Activité récente"
      className="rounded-lg border border-anac-border bg-white p-4 shadow-sm print:border-gray-400 print:p-3 print:shadow-none"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-anac-navy">Activité récente</h2>
        {pageCount > 1 ? (
          <nav aria-label="Pages de l’activité récente" className="flex items-center gap-1 text-xs text-anac-muted print:hidden">
            <button
              type="button"
              aria-label="Page précédente"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="rounded p-1 hover:bg-anac-gray disabled:opacity-40"
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <span>
              {page + 1} / {pageCount}
            </span>
            <button
              type="button"
              aria-label="Page suivante"
              disabled={page >= pageCount - 1}
              onClick={() => setPage(page + 1)}
              className="rounded p-1 hover:bg-anac-gray disabled:opacity-40"
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </div>
      {activity.length === 0 ? (
        <p className="mt-2 text-sm text-anac-muted">Aucune activité récente sur cette période.</p>
      ) : (
        <>
          <ActivityList items={visible} label="Activité récente (écran)" className="print:hidden" />
          <ActivityList items={activity} label="Activité récente (impression)" className="hidden print:block" />
        </>
      )}
    </section>
  );
}

function ActivityList({ items, label, className }: { items: RoleAnalyticsActivity[]; label: string; className: string }) {
  return (
    <ul aria-label={label} className={cn('mt-2 divide-y divide-anac-border', className)}>
      {items.map((item, index) => (
        <li key={`${item.eventKey}-${item.requestId}-${item.at}-${index}`} className="grid grid-cols-[auto_1fr] gap-x-3 py-2 text-sm print:break-inside-avoid print:py-1">
          <time dateTime={item.at} className="text-xs text-anac-muted">
            {formatDateTime(item.at)}
          </time>
          <div className="min-w-0">
            <p className="font-medium text-anac-navy">{EVENT_LABELS[item.eventKey] ?? 'Événement'}</p>
            <p className="text-xs text-anac-muted">
              {item.requestReference ? (
                item.href ? (
                  <Link to={item.href} className="text-anac-blue hover:underline">
                    {item.requestReference}
                  </Link>
                ) : (
                  item.requestReference
                )
              ) : (
                '—'
              )}
              {' · '}
              {actorText(item.actor)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
