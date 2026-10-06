import { useState } from 'react';
import { MeetingCalendar } from '../../components/meetings/MeetingCalendar';
import { MeetingHistoryRow, UpcomingMeetingCard } from '../../components/meetings/MeetingItems';
import { PageError } from '../../components/layout/PageError';
import { dayKey, splitMeetings } from '../../lib/meetings';
import { useMyMeetings } from './useMyMeetings';

/** /reunions - every meeting of every dossier: calendar + upcoming + history. */
export default function MeetingsPage() {
  const { meetings, error, fetching, retry } = useMyMeetings();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [view, setView] = useState<{ year: number; month: number } | null>(null);

  if (error) return <PageError message={error} onRetry={retry} retrying={fetching} />;
  if (meetings === null) return <p className="text-anac-muted text-center">Chargement...</p>;

  const now = new Date();
  const { upcoming, history } = splitMeetings(meetings, now);
  // Open on the month of the next meeting, else the current month.
  const anchor = upcoming[0] ? new Date(upcoming[0].scheduledAt) : now;
  const shown = view ?? { year: anchor.getFullYear(), month: anchor.getMonth() };

  const keyOf = (scheduledAt: string) => dayKey(new Date(scheduledAt));
  const upcomingDays = new Set(upcoming.map((m) => keyOf(m.scheduledAt)));
  const pastDays = new Set(history.map((m) => keyOf(m.scheduledAt)));
  const onDay = (m: { scheduledAt: string }) => !selectedKey || keyOf(m.scheduledAt) === selectedKey;
  const shownUpcoming = upcoming.filter(onDay);
  const shownHistory = history.filter(onDay);
  const selectedLabel = selectedKey
    ? new Date(`${selectedKey}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-anac-navy text-xl font-semibold">Mes réunions</h1>
        <p className="text-anac-muted text-sm">Réunions et visites de tous vos dossiers</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div>
          <MeetingCalendar
            year={shown.year}
            month={shown.month}
            onMonthChange={(year, month) => setView({ year, month })}
            upcomingDays={upcomingDays}
            pastDays={pastDays}
            todayKey={dayKey(now)}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />
        </div>

        <div className="space-y-6">
          {selectedLabel && (
            <p className="text-sm text-anac-navy" aria-live="polite">
              Réunions du <span className="font-semibold">{selectedLabel}</span>
            </p>
          )}

          <section aria-labelledby="upcoming-title" className="space-y-2">
            <h2 id="upcoming-title" className="text-xs font-semibold text-anac-muted">À venir</h2>
            {shownUpcoming.length > 0 ? (
              shownUpcoming.map((meeting) => <UpcomingMeetingCard key={meeting.id} meeting={meeting} now={now} />)
            ) : (
              <p className="rounded-lg border border-dashed border-anac-border bg-white p-4 text-sm text-anac-muted">
                {selectedKey
                  ? 'Aucune réunion à venir ce jour-là.'
                  : "Aucune réunion prévue. L'ANAC vous informera ici dès qu'une réunion sera planifiée."}
              </p>
            )}
          </section>

          {shownHistory.length > 0 && (
            <section aria-labelledby="history-title" className="space-y-2">
              <h2 id="history-title" className="text-xs font-semibold text-anac-muted">Historique</h2>
              <ul className="divide-y divide-anac-border rounded-lg border border-anac-border bg-white">
                {shownHistory.map((meeting) => (
                  <MeetingHistoryRow key={meeting.id} meeting={meeting} now={now} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
