import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { AnalyticsDelayedDossier } from '../../../lib/api/analytics.types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { PHASE_LABELS, formatDisplayDate } from '../analytics.helpers';
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dossier</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Etape actuelle</TableHead>
              <TableHead>Retard</TableHead>
              <TableHead>Derniere action</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dossiers.map((dossier) => (
              <TableRow key={`${dossier.requestId}-${dossier.phaseCode}`}>
                <TableCell className="font-semibold text-anac-navy">{dossier.reference}</TableCell>
                <TableCell className="text-anac-muted">{dossier.organisationName}</TableCell>
                <TableCell className="text-anac-navy">
                  {PHASE_LABELS[dossier.phaseCode] ?? dossier.phaseLabel}
                </TableCell>
                <TableCell className="font-semibold text-red-600">{dossier.delayDays} j</TableCell>
                <TableCell className="text-anac-muted">{formatDisplayDate(dossier.lastActionAt)}</TableCell>
                <TableCell>
                  <Link to="/demandes" className="inline-flex items-center gap-1 font-semibold text-anac-blue">
                    Consulter <ArrowRight size={12} aria-hidden="true" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AnalyticsSection>
  );
}
