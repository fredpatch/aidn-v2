import { describe, expect, it } from 'vitest';
import type { ApplicantMeeting } from './api/meetings.api';
import { buildMonthGrid, dayKey, isAwaitingConfirmation, isUpcoming, relativeDayLabel, splitMeetings } from './meetings';

const NOW = new Date(2026, 9, 6, 10, 30); // Tue 6 Oct 2026, 10:30 local

const meeting = (id: number, status: string, scheduledAt: Date): ApplicantMeeting => ({
  id,
  meetingType: 'formal',
  status,
  scheduledAt: scheduledAt.toISOString(),
  location: null,
  phaseCode: 'M4',
  requestId: 1,
  requestReference: 'DEM-1',
  requestType: 'issuance',
  crDocumentUrl: null,
  ticketAvailable: status === 'scheduled',
});

describe('buildMonthGrid - 6 x 7, weeks start on Monday', () => {
  it('October 2026 starts on Monday 28 September', () => {
    const grid = buildMonthGrid(2026, 9);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toMatchObject({ key: '2026-09-28', inMonth: false });
    expect(grid[3]).toMatchObject({ key: '2026-10-01', inMonth: true });
  });

  it('a month starting on Monday has no leading days (June 2026)', () => {
    expect(buildMonthGrid(2026, 5)[0].key).toBe('2026-06-01');
  });

  it('a month starting on Sunday has 6 leading days (November 2026)', () => {
    expect(buildMonthGrid(2026, 10)[6].key).toBe('2026-11-01');
  });
});

describe('relativeDayLabel - by calendar day, not 24 h blocks', () => {
  it("same day -> Aujourd'hui", () => expect(relativeDayLabel(new Date(2026, 9, 6, 23, 0), NOW)).toBe("Aujourd'hui"));
  it('next day, under 24 h -> Demain', () => expect(relativeDayLabel(new Date(2026, 9, 7, 8, 0), NOW)).toBe('Demain'));
  it('9 days later', () => expect(relativeDayLabel(new Date(2026, 9, 15, 9, 0), NOW)).toBe('Dans 9 jours'));
});

describe('upcoming / history split', () => {
  const past = meeting(1, 'held', new Date(2026, 9, 1));
  const unconfirmed = meeting(2, 'scheduled', new Date(2026, 9, 5, 9));
  const next = meeting(3, 'scheduled', new Date(2026, 9, 15, 9));
  const later = meeting(4, 'scheduled', new Date(2026, 10, 2, 9));
  const superseded = meeting(5, 'rescheduled', new Date(2026, 9, 20, 9));

  it('only scheduled meetings still to come are upcoming', () => {
    expect([past, unconfirmed, next, superseded].map((m) => isUpcoming(m, NOW))).toEqual([false, false, true, false]);
  });

  it('a scheduled meeting already past awaits DN confirmation', () => {
    expect(isAwaitingConfirmation(unconfirmed, NOW)).toBe(true);
    expect(isAwaitingConfirmation(next, NOW)).toBe(false);
    expect(isAwaitingConfirmation(past, NOW)).toBe(false);
  });

  it('upcoming nearest first, history newest first (a future rescheduled row is history)', () => {
    const { upcoming, history } = splitMeetings([later, past, superseded, next, unconfirmed], NOW);
    expect(upcoming.map((m) => m.id)).toEqual([3, 4]);
    expect(history.map((m) => m.id)).toEqual([5, 2, 1]);
  });
});

describe('dayKey', () => {
  it('uses the local calendar day', () => expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05'));
});
