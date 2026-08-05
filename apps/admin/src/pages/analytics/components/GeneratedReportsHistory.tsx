import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { buttonVariants } from '../../../components/ui/button';
import { ReadOnlyTable, type ReadOnlyTableColumn } from '../../../components/common/ReadOnlyTable';
import { cn } from '../../../lib/utils';
import type { GeneratedReport } from '../../../lib/api/reports.types';
import { formatDisplayDate } from '../analytics.helpers';

function formatPeriod(report: GeneratedReport): string {
  return `${formatDisplayDate(report.periodStart)} - ${formatDisplayDate(report.periodEnd)}`;
}

const reportColumns: ReadOnlyTableColumn<GeneratedReport>[] = [
  {
    id: 'report',
    header: 'Rapport',
    className: 'font-semibold text-anac-navy',
    cell: (report) => report.title,
  },
  {
    id: 'format',
    header: 'Format',
    cell: (report) => {
      const Icon = report.format === 'pdf' ? FileText : FileSpreadsheet;
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-anac-blue">
          <Icon size={12} aria-hidden="true" />
          {report.format === 'excel' ? 'xlsx' : report.format}
        </span>
      );
    },
  },
  {
    id: 'period',
    header: 'Période',
    className: 'text-anac-muted',
    cell: formatPeriod,
  },
  {
    id: 'generated-at',
    header: 'Généré le',
    className: 'text-anac-muted',
    cell: (report) => formatDisplayDate(report.createdAt),
  },
  {
    id: 'action',
    header: 'Action',
    cell: (report) =>
      report.fileUrl ? (
        <a
          href={`/api/reports/${report.id}/download`}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'h-8 gap-1.5')}
        >
          <Download size={14} aria-hidden="true" />
          Télécharger
        </a>
      ) : (
        <span
          className={cn(
            buttonVariants({ variant: 'secondary', size: 'sm' }),
            'h-8 gap-1.5 opacity-50'
          )}
        >
          <Download size={14} aria-hidden="true" />
          Indisponible
        </span>
      ),
  },
];

export function GeneratedReportsHistory({
  reports,
  loading,
}: {
  reports: GeneratedReport[];
  loading: boolean;
}) {
  return (
    <section className="rounded-lg border border-anac-border bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-anac-navy">Historique des rapports générés</h2>
        <p className="text-[11px] text-anac-muted">Les 20 derniers exports disponibles au téléchargement.</p>
      </div>

      <div className="mt-3">
        <ReadOnlyTable
          rows={reports}
          columns={reportColumns}
          getRowKey={(report) => report.id}
          loading={loading}
          loadingState={{
            title: 'Chargement des rapports...',
            className: 'min-h-[72px] rounded-md bg-slate-50',
          }}
          emptyState={{
            title: 'Aucun rapport généré pour le moment.',
            className: 'min-h-[72px] rounded-md bg-slate-50',
          }}
        />
      </div>
    </section>
  );
}
