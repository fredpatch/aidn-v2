import { CalendarDays, Filter, RotateCcw } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import type { AnalyticsFilters } from '../../../lib/api/analytics.types';
import { PHASE_OPTIONS, REQUEST_TYPE_OPTIONS, STATUS_OPTIONS, defaultPeriod } from '../analytics.helpers';

export function AnalyticsFilterBar({
  filters,
  onChange,
  onApply,
}: {
  filters: AnalyticsFilters;
  onChange: (filters: AnalyticsFilters) => void;
  onApply: () => void;
}) {
  function update(key: keyof AnalyticsFilters, value: string) {
    onChange({ ...filters, [key]: value });
  }

  function reset() {
    onChange({ ...defaultPeriod(), phaseCode: '', requestType: '', status: '' });
  }

  return (
    <div className="rounded-lg border border-anac-border bg-white p-3 shadow-sm">
      <div className="grid gap-2 md:grid-cols-[1.25fr_1fr_1fr_1fr_auto_auto]">
        <label className="flex h-10 items-center gap-2 rounded-md border border-anac-border bg-white px-3 text-[12px] text-anac-muted">
          <CalendarDays size={14} aria-hidden="true" />
          <span>Periode</span>
          <input
            type="date"
            value={filters.periodStart ?? ''}
            onChange={(event) => update('periodStart', event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-anac-navy outline-none"
            aria-label="Date de debut"
          />
          <span>-</span>
          <input
            type="date"
            value={filters.periodEnd ?? ''}
            onChange={(event) => update('periodEnd', event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-anac-navy outline-none"
            aria-label="Date de fin"
          />
        </label>

        <select
          value={filters.phaseCode ?? ''}
          onChange={(event) => update('phaseCode', event.target.value)}
          className="h-10 rounded-md border border-anac-border bg-white px-3 text-[12px] font-medium text-anac-navy outline-none focus:border-anac-blue"
          aria-label="Filtrer par phase"
        >
          {PHASE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={filters.requestType ?? ''}
          onChange={(event) => update('requestType', event.target.value)}
          className="h-10 rounded-md border border-anac-border bg-white px-3 text-[12px] font-medium text-anac-navy outline-none focus:border-anac-blue"
          aria-label="Filtrer par type de demande"
        >
          {REQUEST_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={filters.status ?? ''}
          onChange={(event) => update('status', event.target.value)}
          className="h-10 rounded-md border border-anac-border bg-white px-3 text-[12px] font-medium text-anac-navy outline-none focus:border-anac-blue"
          aria-label="Filtrer par statut"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <Button variant="secondary" className="h-10 gap-2" onClick={reset}>
          <RotateCcw size={14} aria-hidden="true" />
          Reinitialiser
        </Button>
        <Button className="h-10 gap-2" onClick={onApply}>
          <Filter size={14} aria-hidden="true" />
          Appliquer
        </Button>
      </div>
    </div>
  );
}
