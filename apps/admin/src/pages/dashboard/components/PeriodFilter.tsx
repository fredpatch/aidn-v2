import type { DashboardPeriod } from '../../../lib/api/dashboard.types';

const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: 'this_month', label: 'Ce mois' },
  { value: 'last_30_days', label: '30 derniers jours' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'year', label: 'Annee' },
];

interface PeriodFilterProps {
  value: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  return (
    <>
      <label className="sr-only" htmlFor="dashboard-period">
        Periode
      </label>
      <select
        id="dashboard-period"
        value={value}
        onChange={(event) => onChange(event.target.value as DashboardPeriod)}
        className="h-9 rounded-md border border-anac-border bg-white px-3 text-sm font-medium text-anac-navy shadow-sm outline-none focus:border-anac-blue focus:ring-2 focus:ring-blue-100"
      >
        {PERIOD_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}
