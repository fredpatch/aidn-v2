import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { AnalyticsDelayedDossier } from '../../../lib/api/analytics.types';
import { formatDisplayDate } from '../analytics.helpers';
import { AnalyticsSection } from './AnalyticsSection';

export function DelayedDossiersTable({ dossiers }: { dossiers: AnalyticsDelayedDossier[] }) {
  return (
    <AnalyticsSection
      title="Dossiers les plus en retard"
      subtitle="Phases ouvertes ayant depasse leur cible SLA"
      className="overflow-hidden"
    >
      {dossiers.length === 0 ? (
        <div className="p-6 text-sm text-anac-muted">Aucun dossier hors delai dans cette vue.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-anac-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Dossier</th>
                <th className="px-4 py-3 font-semibold">Organisation</th>
                <th className="px-4 py-3 font-semibold">Etape actuelle</th>
                <th className="px-4 py-3 font-semibold">Retard</th>
                <th className="px-4 py-3 font-semibold">Derniere action</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-anac-border">
              {dossiers.map((dossier) => (
                <tr key={`${dossier.requestId}-${dossier.phaseCode}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-anac-navy">{dossier.reference}</td>
                  <td className="px-4 py-3 text-anac-muted">{dossier.organisationName}</td>
                  <td className="px-4 py-3 text-anac-navy">{dossier.phaseLabel}</td>
                  <td className="px-4 py-3 font-semibold text-red-600">{dossier.delayDays} j</td>
                  <td className="px-4 py-3 text-anac-muted">{formatDisplayDate(dossier.lastActionAt)}</td>
                  <td className="px-4 py-3">
                    <Link
                      to="/demandes"
                      className="inline-flex items-center gap-1 font-semibold text-anac-blue"
                    >
                      Consulter <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AnalyticsSection>
  );
}
