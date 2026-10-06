import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buildMonthGrid } from '../../lib/meetings';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/**
 * Month grid, Monday first. Days with meetings carry a dot (accent: something
 * still to come that day, muted: past only). Selecting a day filters the lists;
 * selecting it again clears the filter.
 */
export function MeetingCalendar({
  year,
  month,
  onMonthChange,
  upcomingDays,
  pastDays,
  todayKey,
  selectedKey,
  onSelect,
}: {
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
  upcomingDays: Set<string>;
  pastDays: Set<string>;
  todayKey: string;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const cells = buildMonthGrid(year, month);
  const title = new Date(year, month, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const shift = (delta: number) => {
    const target = new Date(year, month + delta, 1);
    onMonthChange(target.getFullYear(), target.getMonth());
  };

  return (
    <div className="rounded-lg border border-anac-border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} aria-label="Mois précédent" className="rounded p-1.5 text-anac-navy hover:bg-anac-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold capitalize text-anac-navy" aria-live="polite">{title}</p>
        <button type="button" onClick={() => shift(1)} aria-label="Mois suivant" className="rounded p-1.5 text-anac-navy hover:bg-anac-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky">
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-anac-muted" aria-hidden="true">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1" role="group" aria-label={`Jours de ${title}`}>
        {cells.map((cell) => {
          const hasUpcoming = upcomingDays.has(cell.key);
          const hasPast = pastDays.has(cell.key);
          const isToday = cell.key === todayKey;
          const isSelected = cell.key === selectedKey;
          const label = cell.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelect(isSelected ? null : cell.key)}
              aria-pressed={isSelected}
              aria-label={`${label}${hasUpcoming ? ', réunion à venir' : hasPast ? ', réunion passée' : ''}${isToday ? ", aujourd'hui" : ''}`}
              className={`relative rounded py-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky ${
                isSelected
                  ? 'bg-anac-navy text-white'
                  : cell.inMonth
                    ? 'text-anac-text hover:bg-anac-gray'
                    : 'text-anac-muted/50 hover:bg-anac-gray'
              } ${isToday && !isSelected ? 'ring-1 ring-anac-blue font-semibold' : ''}`}
            >
              {cell.date.getDate()}
              {(hasUpcoming || hasPast) && (
                <span
                  aria-hidden="true"
                  className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                    isSelected ? 'bg-white' : hasUpcoming ? 'bg-anac-blue' : 'bg-anac-muted'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-anac-muted">
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-anac-blue" aria-hidden="true" />À venir</span>
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-anac-muted" aria-hidden="true" />Passée</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm ring-1 ring-anac-blue" aria-hidden="true" />Aujourd&apos;hui</span>
      </p>
      {selectedKey && (
        <button type="button" onClick={() => onSelect(null)} className="mt-2 text-xs text-anac-blue underline">
          Afficher toutes les réunions
        </button>
      )}
    </div>
  );
}
