import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';

import { Button, buttonVariants } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { fetchDashboardSummary } from '../../lib/api/dashboard.api';
import type { DashboardPeriod } from '../../lib/api/dashboard.types';
import { ActivityTimeline } from './components/ActivityTimeline';
import { DashboardMetricCard } from './components/DashboardMetricCard';
import { NextActionList } from './components/NextActionList';
import { OperationalAlertGrid } from './components/OperationalAlertGrid';
import { PeriodFilter } from './components/PeriodFilter';
import { ProgressMetricCard } from './components/ProgressMetricCard';
import { StatusDistributionCard } from './components/StatusDistributionCard';
import { UpcomingMeetingsCard } from './components/UpcomingMeetingsCard';
import { WorkflowPhaseSummary } from './components/WorkflowPhaseSummary';

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
          <PeriodFilter value={period} onChange={setPeriod} />
          <Link to="/demandes" className={cn(buttonVariants(), 'h-9 gap-2 px-3')}>
            <Plus size={14} aria-hidden="true" />
            Nouvelle demande
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {data.metrics.map((metric) => (
          <DashboardMetricCard key={metric.key} metric={metric} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <WorkflowPhaseSummary phases={data.workflow} />
        <StatusDistributionCard items={data.statusDistribution} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr_1.05fr]">
        <NextActionList actions={data.actions} />
        <UpcomingMeetingsCard meetings={data.meetings} />
        <ActivityTimeline activity={data.activity} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[2fr_1.05fr]">
        <OperationalAlertGrid alerts={data.alerts} />
        <ProgressMetricCard items={data.performance} />
      </div>
    </div>
  );
}
