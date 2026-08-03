import { ChevronDown, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import type { AnalyticsReportCard } from '../../../lib/api/analytics.types';
import type { ReportFormat, ReportKey } from '../../../lib/api/reports.types';
import { REPORT_ICONS } from '../analytics.helpers';

interface ReportCardsProps {
  reports: AnalyticsReportCard[];
  generatingKey: string | null;
  onGenerate: (reportKey: ReportKey, format: ReportFormat) => void;
}

export function ReportCards({ reports, generatingKey, onGenerate }: ReportCardsProps) {
  return (
    <section className="rounded-lg border border-anac-border bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-anac-navy">Rapports disponibles</h2>
        <p className="text-[11px] text-anac-muted">
          Générez un PDF officiel ou un classeur Excel à partir des filtres appliqués.
        </p>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {reports.map((report) => {
          const Icon = REPORT_ICONS[report.key] ?? ChevronDown;
          const pdfBusy = generatingKey === `${report.key}:pdf`;
          const excelBusy = generatingKey === `${report.key}:excel`;
          return (
            <article key={report.key} className="rounded-lg border border-anac-border p-3">
              <div className="flex items-start gap-3">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-anac-blue">
                  <Icon size={16} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[12px] font-semibold text-anac-navy">{report.title}</h3>
                  <p className="mt-1 min-h-[32px] text-[11px] text-anac-muted">{report.description}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!report.available || pdfBusy || excelBusy}
                  className="h-8 gap-1.5"
                  onClick={() => onGenerate(report.key as ReportKey, 'pdf')}
                >
                  <FileText size={13} aria-hidden="true" />
                  {pdfBusy ? 'PDF...' : 'PDF'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!report.available || pdfBusy || excelBusy}
                  className="h-8 gap-1.5"
                  onClick={() => onGenerate(report.key as ReportKey, 'excel')}
                >
                  <FileSpreadsheet size={13} aria-hidden="true" />
                  {excelBusy ? 'Excel...' : 'Excel'}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
