import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ReadOnlyTable, type ReadOnlyTableColumn } from '../../../components/common/ReadOnlyTable';
import type { AnalyticsDelayedDossier } from '../../../lib/api/analytics.types';
import { PHASE_LABELS, formatDisplayDate } from '../analytics.helpers';
import { AnalyticsSection } from './AnalyticsSection';

const delayedDossierColumns: ReadOnlyTableColumn<AnalyticsDelayedDossier>[] = [
  {
    id: 'dossier',
    header: 'Dossier',
    className: 'font-semibold text-anac-navy',
    cell: (dossier) => dossier.reference,
  },
  {
    id: 'organisation',
    header: 'Organisation',
    className: 'text-anac-muted',
    cell: (dossier) => dossier.organisationName,
  },
  {
    id: 'current-phase',
    header: 'Etape actuelle',
    className: 'text-anac-navy',
    cell: (dossier) => PHASE_LABELS[dossier.phaseCode] ?? dossier.phaseLabel,
  },
  {
    id: 'delay',
    header: 'Retard',
    className: 'font-semibold text-red-600',
    cell: (dossier) => `${dossier.delayDays} j`,
  },
  {
    id: 'last-action',
    header: 'Derniere action',
    className: 'text-anac-muted',
    cell: (dossier) => formatDisplayDate(dossier.lastActionAt),
  },
  {
    id: 'action',
    header: 'Action',
    cell: () => (
      <Link to="/demandes" className="inline-flex items-center gap-1 font-semibold text-anac-blue">
        Consulter <ArrowRight size={12} aria-hidden="true" />
      </Link>
    ),
  },
];

export function DelayedDossiersTable({ dossiers }: { dossiers: AnalyticsDelayedDossier[] }) {
  return (
    <AnalyticsSection
      title="Dossiers les plus en retard"
      subtitle="Phases ouvertes ayant depasse leur cible SLA"
      className="overflow-hidden"
    >
      <ReadOnlyTable
        rows={dossiers}
        columns={delayedDossierColumns}
        getRowKey={(dossier) => `${dossier.requestId}-${dossier.phaseCode}`}
        emptyState={{
          title: 'Aucun dossier hors delai dans cette vue.',
          className: 'min-h-[96px]',
        }}
      />
    </AnalyticsSection>
  );
}
