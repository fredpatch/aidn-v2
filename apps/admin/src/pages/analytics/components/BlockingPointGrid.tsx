import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDown, ArrowRight, Clock } from 'lucide-react';
import type { AnalyticsBlockingPoint } from '../../../lib/api/analytics.types';
import { cn } from '../../../lib/utils';
import { MEETING_FOLLOW_UPS_ANCHOR } from './MeetingFollowUpsSection';

/** K6 - these two cards point to their list further down this page. */
const IN_PAGE_LINKS: Record<string, string> = {
  missing_reports: 'Voir les réunions',
  missing_r3_opinions: 'Voir les visites',
};

const toneStyles: Record<AnalyticsBlockingPoint['tone'], string> = {
  danger: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-orange-200 bg-orange-50 text-orange-700',
  info: 'border-blue-100 bg-blue-50 text-anac-blue',
};

export function BlockingPointGrid({ points }: { points: AnalyticsBlockingPoint[] }) {
  return (
    <section className="rounded-lg border border-anac-border bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-anac-navy">Points de blocage</h2>
        <p className="text-[11px] text-anac-muted">Alertes détectées impactant les délais.</p>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {points.map((point) => {
          const Icon = point.tone === 'info' ? Clock : AlertTriangle;
          return (
            <article key={point.key} className={cn('rounded-lg border p-3', toneStyles[point.tone])}>
              <div className="flex items-center gap-2">
                <Icon size={16} aria-hidden="true" />
                <p className="text-[12px] font-semibold">{point.label}</p>
              </div>
              <p className="mt-3 text-2xl font-semibold leading-none">{point.value}</p>
              <p className="mt-2 min-h-[30px] text-[11px]">{point.helper}</p>
              {IN_PAGE_LINKS[point.key] ? (
                <a
                  href={`#${MEETING_FOLLOW_UPS_ANCHOR}`}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-anac-blue"
                >
                  {IN_PAGE_LINKS[point.key]} <ArrowDown size={12} aria-hidden="true" />
                </a>
              ) : point.href ? (
                <Link
                  to={point.href}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-anac-blue"
                >
                  Voir la liste <ArrowRight size={12} aria-hidden="true" />
                </Link>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
