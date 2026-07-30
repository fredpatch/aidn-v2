import type { LucideIcon } from 'lucide-react';

export function UserMetricCard({
  label,
  value,
  help,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  help: string;
  icon: LucideIcon;
  tone: 'blue' | 'amber' | 'violet' | 'green';
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  };

  return (
    <article className="rounded-lg border border-anac-border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-anac-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-anac-navy">{value}</p>
        </div>
        <span className={`rounded-lg border p-2.5 ${tones[tone]}`}>
          <Icon size={20} />
        </span>
      </div>
      <p className="mt-4 text-xs text-anac-muted">{help}</p>
    </article>
  );
}
