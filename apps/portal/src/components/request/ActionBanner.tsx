import { AlertCircle, Archive, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import type { BannerContent } from '../../pages/requests/progress';

const KIND_STYLES: Record<BannerContent['kind'], { box: string; accent: string; icon: typeof Clock3 }> = {
  action: { box: 'border-anac-warning/40 bg-anac-warning/10', accent: 'text-anac-warning', icon: AlertCircle },
  waiting: { box: 'border-anac-sky/30 bg-anac-sky/10', accent: 'text-anac-blue', icon: Clock3 },
  done: { box: 'border-anac-success/30 bg-anac-success/10', accent: 'text-anac-success', icon: CheckCircle2 },
  rejected: { box: 'border-anac-danger/30 bg-anac-danger/5', accent: 'text-anac-danger', icon: XCircle },
  cancelled: { box: 'border-anac-border bg-white', accent: 'text-anac-muted', icon: Archive },
};

/** Top-of-dossier message: what to do now, or the final outcome of a closed dossier. */
export function ActionBanner({ banner }: { banner: BannerContent }) {
  const { box, accent, icon: Icon } = KIND_STYLES[banner.kind];

  return (
    <div role="status" className={`flex items-start gap-3 rounded-lg border p-4 ${box}`}>
      <Icon size={20} className={`mt-0.5 flex-shrink-0 ${accent}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className={`text-xs font-semibold ${accent}`}>{banner.eyebrow}</p>
        <p className="text-sm font-semibold text-anac-navy">{banner.title}</p>
        <p className="mt-0.5 text-sm text-anac-text">{banner.description}</p>
      </div>
    </div>
  );
}
