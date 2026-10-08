import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { AnalyticsMeetingFollowUp, AnalyticsOverview } from '../../../lib/api/analytics.types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { cn } from '../../../lib/utils';
import { formatDisplayDate } from '../analytics.helpers';

/** Compact density of the approved mockup (the shared cells default to text-sm). */
const CELL = 'px-3 py-2 text-[12px]';

/** A long list scrolls inside its column instead of stretching the page. */
const LIST_BOX = 'max-h-[26rem] overflow-y-auto';

/** Anchor targeted by the two meeting cards of the blocking-point grid. */
export const MEETING_FOLLOW_UPS_ANCHOR = 'suivi-reunions';

const MEETING_LABELS: Record<AnalyticsMeetingFollowUp['meetingType'], string> = {
  preliminary: 'Préliminaire',
  formal: 'Formelle',
  site_visit: 'Visite sur site',
};

/** The phase page where the follow-up is done (compte-rendu or R3 opinion). */
export function followUpPhasePath(item: AnalyticsMeetingFollowUp): string {
  const page = {
    preliminary: 'phase-preliminaire',
    formal: 'phase-formelle',
    site_visit: 'demonstration-inspection',
  }[item.meetingType];
  return `/demandes/${item.requestId}/${page}`;
}

function DossierCell({ item }: { item: AnalyticsMeetingFollowUp }) {
  return (
    <TableCell className={cn(CELL, 'pl-4')}>
      <div className="whitespace-nowrap font-semibold text-anac-navy">{item.reference}</div>
      <div className="text-anac-muted">{item.organisationName}</div>
    </TableCell>
  );
}

function OpenPhaseCell({ item }: { item: AnalyticsMeetingFollowUp }) {
  return (
    <TableCell className={cn(CELL, 'whitespace-nowrap pr-4')}>
      <Link
        to={followUpPhasePath(item)}
        className="inline-flex items-center gap-1 font-semibold text-anac-blue"
        aria-label={`Ouvrir la phase du dossier ${item.reference}`}
      >
        Ouvrir la phase <ArrowRight size={12} aria-hidden="true" />
      </Link>
    </TableCell>
  );
}

function Empty() {
  return <p className="px-4 py-3 text-[11px] text-anac-muted">Rien à suivre pour le moment.</p>;
}

/** K6 - meetings that may need someone's action. Informational (the
 *  compte-rendu is optional): neutral styling, oldest first, one link per
 *  line to the phase where the action is done. */
export function MeetingFollowUpsSection({
  followUps,
}: {
  followUps: AnalyticsOverview['meetingFollowUps'];
}) {
  const { missingReports, missingR3Opinions } = followUps;
  return (
    <section
      id={MEETING_FOLLOW_UPS_ANCHOR}
      aria-labelledby="suivi-reunions-titre"
      className="scroll-mt-4 rounded-lg border border-anac-border bg-white shadow-sm"
    >
      <div className="border-b border-anac-border px-4 py-3">
        <h2 id="suivi-reunions-titre" className="text-sm font-semibold text-anac-navy">
          Suivi des réunions
        </h2>
        <p className="mt-0.5 text-[11px] text-anac-muted">
          Pour information : où intervenir si nécessaire. Les plus anciennes en premier.
        </p>
      </div>
      <div className="grid xl:grid-cols-2">
        <div className="border-anac-border xl:border-r">
          <div className="px-4 pb-2 pt-3">
            <h3 className="text-[13px] font-semibold text-anac-navy">
              Comptes-rendus non déposés{' '}
              <span className="font-medium text-anac-muted">· {missingReports.length}</span>
            </h3>
            <p className="mt-0.5 text-[11px] text-anac-muted">
              Facultatif - souvent transmis par Outlook.
            </p>
          </div>
          {missingReports.length === 0 ? (
            <Empty />
          ) : (
            <div className={LIST_BOX}>
              <Table aria-label="Comptes-rendus non déposés">
                <TableHeader>
                  <TableRow>
                    <TableHead>Dossier</TableHead>
                    <TableHead>Réunion</TableHead>
                    <TableHead>Tenue le</TableHead>
                    <TableHead>Agent DN</TableHead>
                    <TableHead>
                      <span className="sr-only">Action</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missingReports.map((item) => (
                    <TableRow key={item.meetingId}>
                      <DossierCell item={item} />
                      <TableCell className={CELL}>{MEETING_LABELS[item.meetingType]}</TableCell>
                      <TableCell className={cn(CELL, 'text-anac-muted')}>
                        {formatDisplayDate(item.scheduledAt)}
                      </TableCell>
                      <TableCell className={cn(CELL, 'text-anac-muted')}>
                        {item.agentName ?? '-'}
                      </TableCell>
                      <OpenPhaseCell item={item} />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <div className="border-t border-anac-border xl:border-t-0">
          <div className="px-4 pb-2 pt-3">
            <h3 className="text-[13px] font-semibold text-anac-navy">
              Avis R3 en attente{' '}
              <span className="font-medium text-anac-muted">· {missingR3Opinions.length}</span>
            </h3>
            <p className="mt-0.5 text-[11px] text-anac-muted">
              Visites sur site tenues, avis pas encore soumis.
            </p>
          </div>
          {missingR3Opinions.length === 0 ? (
            <Empty />
          ) : (
            <div className={LIST_BOX}>
              <Table aria-label="Avis R3 en attente">
                <TableHeader>
                  <TableRow>
                    <TableHead>Dossier</TableHead>
                    <TableHead>Visite le</TableHead>
                    <TableHead>Inspecteur R3</TableHead>
                    <TableHead>
                      <span className="sr-only">Action</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missingR3Opinions.map((item) => (
                    <TableRow key={item.meetingId}>
                      <DossierCell item={item} />
                      <TableCell className={cn(CELL, 'text-anac-muted')}>
                        {formatDisplayDate(item.scheduledAt)}
                      </TableCell>
                      <TableCell className={cn(CELL, 'text-anac-muted')}>
                        {item.agentName ?? '-'}
                      </TableCell>
                      <OpenPhaseCell item={item} />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
