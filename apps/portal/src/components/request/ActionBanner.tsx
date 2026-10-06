import { AlertCircle, Clock3 } from 'lucide-react';
import type { BannerContent } from '../../pages/requests/progress';

/** Top-of-dossier "what now" message: amber when the applicant must act. */
export function ActionBanner({ banner }: { banner: BannerContent }) {
  const isAction = banner.kind === 'action';
  const Icon = isAction ? AlertCircle : Clock3;

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-lg border p-4 ${
        isAction ? 'border-anac-warning/40 bg-anac-warning/10' : 'border-anac-sky/30 bg-anac-sky/10'
      }`}
    >
      <Icon
        size={20}
        className={`mt-0.5 flex-shrink-0 ${isAction ? 'text-anac-warning' : 'text-anac-blue'}`}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className={`text-xs font-semibold ${isAction ? 'text-anac-warning' : 'text-anac-blue'}`}>
          {banner.eyebrow}
        </p>
        <p className="text-sm font-semibold text-anac-navy">{banner.title}</p>
        <p className="mt-0.5 text-sm text-anac-text">{banner.description}</p>
      </div>
    </div>
  );
}
