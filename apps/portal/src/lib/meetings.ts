import type { ApplicantMeeting } from './api/meetings.api';

/** Local calendar day key (YYYY-MM-DD) - the applicant's own time zone. */
export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Still to come: scheduled and not yet started. */
export function isUpcoming(meeting: ApplicantMeeting, now: Date): boolean {
  return meeting.status === 'scheduled' && new Date(meeting.scheduledAt).getTime() >= now.getTime();
}

/** Scheduled but already past: the DN has not recorded the outcome yet. */
export function isAwaitingConfirmation(meeting: ApplicantMeeting, now: Date): boolean {
  return meeting.status === 'scheduled' && new Date(meeting.scheduledAt).getTime() < now.getTime();
}

/** Upcoming nearest first; everything else (history) newest first. */
export function splitMeetings(meetings: ApplicantMeeting[], now: Date) {
  const time = (m: ApplicantMeeting) => new Date(m.scheduledAt).getTime();
  const upcoming = meetings.filter((m) => isUpcoming(m, now)).sort((a, b) => time(a) - time(b));
  const history = meetings.filter((m) => !isUpcoming(m, now)).sort((a, b) => time(b) - time(a));
  return { upcoming, history };
}

/** "Aujourd'hui", "Demain", "Dans N jours" - by calendar day, not 24h blocks. */
export function relativeDayLabel(date: Date, now: Date): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(now)) / 86_400_000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Demain';
  return `Dans ${days} jours`;
}

export interface CalendarCell {
  date: Date;
  key: string;
  inMonth: boolean;
}

/** 6 x 7 grid for a month, weeks starting on Monday (French convention). */
export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(year, month, 1 - offset + i);
    cells.push({ date, key: dayKey(date), inMonth: date.getMonth() === month });
  }
  return cells;
}

export function formatMeetingDate(value: string): string {
  return new Date(value).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatMeetingTime(value: string): string {
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
