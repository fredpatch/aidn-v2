import { AlertCircle, CheckCircle2, Info, Lock } from 'lucide-react';
import type { FormalNextAction } from '../helpers';

interface FormalPhaseSummaryCardProps {
  phaseStatus: string;
  nextAction: FormalNextAction;
  depositedDocuments: number;
  totalDocuments: number;
  reportUploaded: boolean;
  blockReason: string | null;
}

const toneStyles = {
  info: {
    icon: Info,
    wrapper: 'border-anac-info/30 bg-anac-info/5',
    badge: 'bg-anac-info/10 text-anac-info',
  },
  warning: {
    icon: AlertCircle,
    wrapper: 'border-anac-warning/30 bg-anac-warning/5',
    badge: 'bg-anac-warning/10 text-anac-warning',
  },
  success: {
    icon: CheckCircle2,
    wrapper: 'border-anac-success/30 bg-anac-success/5',
    badge: 'bg-anac-success/10 text-anac-success',
  },
  muted: {
    icon: Lock,
    wrapper: 'border-anac-border bg-white',
    badge: 'bg-anac-muted/10 text-anac-muted',
  },
};

export default function FormalPhaseSummaryCard({
  phaseStatus,
  nextAction,
  depositedDocuments,
  totalDocuments,
  reportUploaded,
  blockReason,
}: FormalPhaseSummaryCardProps) {
  const tone = toneStyles[nextAction.tone];
  const Icon = tone.icon;
  const phaseLabel = phaseStatus === 'closed' ? 'Clôturée' : 'Ouverte';

  return (
    <section
      className={`border rounded-lg p-4 ${tone.wrapper}`}
      aria-labelledby="formal-next-action-title"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex gap-3">
          <Icon size={16} className="mt-0.5 flex-shrink-0 text-anac-navy" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="formal-next-action-title" className="text-base font-semibold text-anac-navy">
                {nextAction.title}
              </h2>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone.badge}`}>
                {phaseLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-anac-text">{nextAction.description}</p>
            {blockReason && phaseStatus !== 'closed' && (
              <p className="mt-2 text-xs font-medium text-anac-warning">{blockReason}</p>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-3 text-xs lg:min-w-[360px]">
          <div className="border-l border-anac-border pl-3">
            <dt className="text-anac-muted">Responsable</dt>
            <dd className="mt-1 font-semibold text-anac-navy">{nextAction.owner}</dd>
          </div>
          <div className="border-l border-anac-border pl-3">
            <dt className="text-anac-muted">Documents déposés</dt>
            <dd className="mt-1 font-semibold text-anac-navy">
              {depositedDocuments}/{totalDocuments}
            </dd>
          </div>
          <div className="border-l border-anac-border pl-3">
            <dt className="text-anac-muted">Compte-rendu</dt>
            <dd className="mt-1 font-semibold text-anac-navy">
              {reportUploaded ? 'Déposé' : 'Facultatif'}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
