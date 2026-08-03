import { ChevronDown } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import type { AnalyticsReportCard } from '../../../lib/api/analytics.types';
import { REPORT_ICONS } from '../analytics.helpers';

export function ReportCards({ reports }: { reports: AnalyticsReportCard[] }) {
  return (
    <section className="rounded-lg border border-anac-border bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-anac-navy">Rapports disponibles</h2>
        <p className="text-[11px] text-anac-muted">
          Generation et export seront branches apres validation du contrat de donnees.
        </p>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {reports.map((report) => {
          const Icon = REPORT_ICONS[report.key] ?? ChevronDown;
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
              <Button variant="secondary" size="sm" disabled={!report.available} className="mt-3 h-8 w-full">
                {report.available ? 'Generer' : 'A venir'}
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
