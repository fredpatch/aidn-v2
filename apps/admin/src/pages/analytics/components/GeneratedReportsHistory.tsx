import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { buttonVariants } from '../../../components/ui/button';
import { TableState } from '../../../components/common/TableState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
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
        <TableState
          state="loading"
          title="Chargement des rapports..."
          className="mt-3 min-h-[72px] rounded-md bg-slate-50"
        />
      ) : reports.length === 0 ? (
        <TableState
          state="empty"
          title="Aucun rapport généré pour le moment."
          className="mt-3 min-h-[72px] rounded-md bg-slate-50"
        />
      ) : (
        <div className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rapport</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Période</TableHead>
                <TableHead>Généré le</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => {
                const Icon = report.format === 'pdf' ? FileText : FileSpreadsheet;
                return (
                  <TableRow key={report.id}>
                    <TableCell className="font-semibold text-anac-navy">{report.title}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-anac-blue">
                        <Icon size={12} aria-hidden="true" />
                        {report.format === 'excel' ? 'xlsx' : report.format}
                      </span>
                    </TableCell>
                    <TableCell className="text-anac-muted">{formatPeriod(report)}</TableCell>
                    <TableCell className="text-anac-muted">{formatDisplayDate(report.createdAt)}</TableCell>
                    <TableCell>
                      {report.fileUrl ? (
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
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
