import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import type { GeneratedReport } from '../../../lib/api/reports.types';
import { formatDisplayDate } from '../analytics.helpers';

function formatPeriod(report: GeneratedReport): string {
  return `${formatDisplayDate(report.periodStart)} - ${formatDisplayDate(report.periodEnd)}`;
}

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

      {loading ? (
        <div className="mt-3 rounded-md bg-slate-50 p-4 text-sm text-anac-muted">Chargement des rapports...</div>
      ) : reports.length === 0 ? (
        <div className="mt-3 rounded-md bg-slate-50 p-4 text-sm text-anac-muted">
          Aucun rapport généré pour le moment.
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-anac-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Rapport</th>
                <th className="px-4 py-3 font-semibold">Format</th>
                <th className="px-4 py-3 font-semibold">Période</th>
                <th className="px-4 py-3 font-semibold">Généré le</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-anac-border">
              {reports.map((report) => {
                const Icon = report.format === 'pdf' ? FileText : FileSpreadsheet;
                return (
                  <tr key={report.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-anac-navy">{report.title}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 font-semibold uppercase text-anac-blue">
                        <Icon size={12} aria-hidden="true" />
                        {report.format === 'excel' ? 'xlsx' : report.format}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-anac-muted">{formatPeriod(report)}</td>
                    <td className="px-4 py-3 text-anac-muted">{formatDisplayDate(report.createdAt)}</td>
                    <td className="px-4 py-3">
                      {report.fileUrl ? (
                        <a
                          href={`/api/reports/${report.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'h-8 gap-1.5')}
                        >
                          <Download size={13} aria-hidden="true" />
                          Télécharger
                        </a>
                      ) : (
                        <span
                          className={cn(
                            buttonVariants({ variant: 'secondary', size: 'sm' }),
                            'h-8 gap-1.5 opacity-50'
                          )}
                        >
                          <Download size={13} aria-hidden="true" />
                          Indisponible
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
