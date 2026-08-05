import type { ElementType } from 'react';
import { ArrowDownAZ, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { cn } from '../../../lib/utils';

type SortKey = 'waiting' | 'newest' | 'oldest';

export function S5Header() {
  return (
    <header>
      <p className="text-xs font-medium text-anac-muted">Direction de la Navigabilite</p>
      <h1 className="mt-2 text-2xl font-semibold leading-tight text-anac-navy">Facturation S5</h1>
      <p className="mt-1 text-sm text-anac-muted">
        Suivez les factures recues par S5, leur transmission au postulant et la validation des preuves de paiement.
      </p>
    </header>
  );
}

export function S5MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  helper: string;
  icon: ElementType;
  tone: 'blue' | 'warning' | 'success' | 'purple';
}) {
  const toneClass = {
    blue: 'border-blue-100 bg-blue-50 text-anac-blue',
    warning: 'border-orange-100 bg-orange-50 text-anac-warning',
    success: 'border-green-100 bg-green-50 text-anac-success',
    purple: 'border-violet-100 bg-violet-50 text-violet-700',
  }[tone];

  return (
    <section className="rounded-lg border border-anac-border bg-white p-4 shadow-[0_8px_22px_rgba(17,34,83,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-anac-muted">{label}</p>
          <p className="mt-2 text-[26px] font-semibold leading-none text-anac-navy">{value}</p>
        </div>
        <div className={cn('rounded-lg border p-2.5', toneClass)}>
          <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-4 text-[11px] text-anac-muted">{helper}</p>
    </section>
  );
}

export function S5Toolbar({
  query,
  sort,
  onQueryChange,
  onSortChange,
}: {
  query: string;
  sort: SortKey;
  onQueryChange: (value: string) => void;
  onSortChange: (value: SortKey) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-anac-border p-4 md:flex-row md:items-center md:justify-between">
      <label className="relative min-w-0 flex-1">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
          aria-hidden="true"
        />
        <span className="sr-only">Rechercher un paiement</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Rechercher un dossier, organisme, phase..."
          className="h-10 w-full rounded-lg border border-anac-border bg-white pl-9 pr-3 text-sm text-anac-navy outline-none transition focus:border-anac-sky focus:ring-2 focus:ring-anac-sky/30"
        />
      </label>
      <Select value={sort} onValueChange={(value) => onSortChange(value as SortKey)}>
        <SelectTrigger className="h-10 w-[220px] gap-2 text-sm font-medium text-anac-navy">
          <ArrowDownAZ size={14} className="shrink-0 text-anac-muted" aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="waiting">Attente la plus longue</SelectItem>
          <SelectItem value="newest">Plus recents</SelectItem>
          <SelectItem value="oldest">Plus anciens</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
