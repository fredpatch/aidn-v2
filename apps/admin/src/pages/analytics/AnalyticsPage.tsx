import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, RefreshCcw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { fetchAnalyticsOverview } from '../../lib/api/analytics.api';
import type { AnalyticsFilters } from '../../lib/api/analytics.types';
import { fetchGeneratedReports, generateReport } from '../../lib/api/reports.api';
import type { ReportFormat, ReportKey } from '../../lib/api/reports.types';
import { apiErrorMessage } from '../../lib/axios';
import { notify } from '../../lib/notify';
import { AnalyticsFilterBar } from './components/AnalyticsFilterBar';
import { AnalyticsMetricCard } from './components/AnalyticsMetricCard';
import {
  DistributionChart,
  DurationTrendChart,
  PhaseDurationChart,
} from './components/AnalyticsCharts';
import { BlockingPointGrid } from './components/BlockingPointGrid';
import { DelayedDossiersTable } from './components/DelayedDossiersTable';
import { GeneratedReportsHistory } from './components/GeneratedReportsHistory';
import { KpiExplanationPanel } from './components/KpiExplanationPanel';
import { ReportCards } from './components/ReportCards';
import { PHASE_LABELS, defaultPeriod } from './analytics.helpers';

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const [draftFilters, setDraftFilters] = useState<AnalyticsFilters>({
    ...defaultPeriod(),
    phaseCode: '',
    requestType: '',
    status: '',
  });
  const [appliedFilters, setAppliedFilters] = useState<AnalyticsFilters>(draftFilters);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-overview', appliedFilters],
    queryFn: () => fetchAnalyticsOverview(appliedFilters),
  });

  const generatedReportsQuery = useQuery({
    queryKey: ['generated-reports'],
    queryFn: fetchGeneratedReports,
  });

  const generateReportMutation = useMutation({
    mutationFn: ({ reportKey, format }: { reportKey: ReportKey; format: ReportFormat }) =>
      generateReport({ ...appliedFilters, reportKey, format }),
    onSuccess: (report) => {
      notify.success('Rapport généré.');
      queryClient.invalidateQueries({ queryKey: ['generated-reports'] });
      window.open(`/api/reports/${report.id}/download`, '_blank', 'noopener,noreferrer');
    },
    onError: (error) => {
      notify.error(apiErrorMessage(error, 'Génération du rapport impossible.'));
    },
  });

  const generatingKey =
    generateReportMutation.isPending && generateReportMutation.variables
      ? `${generateReportMutation.variables.reportKey}:${generateReportMutation.variables.format}`
      : null;

  const handleGenerateReport = (reportKey: ReportKey, format: ReportFormat) => {
    generateReportMutation.mutate({ reportKey, format });
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-anac-border bg-white p-6 text-sm text-anac-muted">
        Chargement des indicateurs analytiques...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 p-6">
        <h1 className="text-lg font-semibold text-anac-danger">Analytique indisponible</h1>
        <p className="mt-2 text-sm text-anac-muted">Impossible de charger les indicateurs.</p>
        <Button className="mt-4 gap-2" onClick={() => refetch()}>
          <RefreshCcw size={14} aria-hidden="true" />
          Reessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1580px] space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-medium text-anac-muted">Analytique & rapports</p>
          <h1 className="mt-2 text-2xl font-semibold text-anac-navy">Analytique & rapports</h1>
          <p className="mt-1 text-sm text-anac-muted">
            Suivez les delais de traitement, les retards et le respect des SLA a chaque etape.
          </p>
        </div>

        <Button
          variant="secondary"
          className="h-9 gap-2"
          disabled={generateReportMutation.isPending}
          onClick={() => handleGenerateReport('full_report', 'pdf')}
        >
          <Download size={14} aria-hidden="true" />
          {generatingKey === 'full_report:pdf' ? 'Génération...' : 'Exporter le rapport'}
        </Button>
      </div>

      <AnalyticsFilterBar
        filters={draftFilters}
        onChange={setDraftFilters}
        onApply={() => setAppliedFilters(draftFilters)}
      />

      {data.warnings.length > 0 ? (
        <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-[12px] text-orange-800">
          {data.warnings.join(' - ')}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {data.metrics.map((metric) => (
          <AnalyticsMetricCard key={metric.key} metric={metric} />
        ))}
      </div>

      <KpiExplanationPanel phases={data.phaseStats} />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1.2fr_0.95fr_0.95fr]">
        <DurationTrendChart points={data.durationTrend} />
        <PhaseDurationChart phases={data.phaseStats} />
        <DistributionChart
          title="Repartition par anciennete"
          subtitle="Dossiers actifs"
          items={data.agingDistribution}
        />
        <DistributionChart
          title="Respect des SLA"
          subtitle="Phases cloturees sur la periode"
          items={data.slaDistribution}
        />
      </div>

      <BlockingPointGrid points={data.blockingPoints} />

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <DelayedDossiersTable dossiers={data.delayedDossiers} />
        <section className="rounded-lg border border-anac-border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-anac-navy">Temps moyen par phase</h2>
          <p className="text-[11px] text-anac-muted">Lecture operationnelle des phases sur la periode.</p>
          <div className="mt-3 divide-y divide-anac-border">
            {data.phaseStats.map((phase) => (
              <div key={phase.phaseCode} className="grid grid-cols-[1fr_auto_auto] gap-3 py-2 text-[12px]">
                <span className="font-semibold text-anac-navy">{PHASE_LABELS[phase.phaseCode]}</span>
                <span className="text-anac-muted">
                  moyenne {phase.averageClosedDurationDays === null ? '-' : `${phase.averageClosedDurationDays} j`}
                </span>
                <span className="text-anac-muted">SLA {phase.slaTargetDays} j</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <ReportCards reports={data.reports} generatingKey={generatingKey} onGenerate={handleGenerateReport} />

      <GeneratedReportsHistory reports={generatedReportsQuery.data ?? []} loading={generatedReportsQuery.isLoading} />
    </div>
  );
}
