import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { queryKeys } from '../../lib/react-query/queryKeys';
import type { ApplicantMeeting } from '../../lib/api/meetings.api';
import { renderWithProviders } from '../../test/render';
import { NextMeetingCard } from '../../components/meetings/NextMeetingCard';
import MeetingsPage from './MeetingsPage';

const NOW = new Date(2026, 9, 6, 10, 30);
const at = (month: number, day: number, hour = 9) => new Date(2026, month, day, hour).toISOString();
const meeting = (id: number, meetingType: ApplicantMeeting['meetingType'], status: string, scheduledAt: string, extra: Partial<ApplicantMeeting> = {}): ApplicantMeeting => ({
  id, meetingType, status, scheduledAt, location: 'Salle de conférence Siège', phaseCode: 'M4', requestId: 42,
  requestReference: 'DEM-2026-10-05-OMAT-02', requestType: 'recognition', crDocumentUrl: null,
  ticketAvailable: status === 'scheduled', ...extra,
});
const MEETINGS = [
  meeting(1, 'preliminary', 'held', at(8, 16), { crDocumentUrl: '/api/files/7' }),
  meeting(2, 'site_visit', 'rescheduled', at(9, 1)),
  meeting(3, 'formal', 'scheduled', at(9, 4)), // past, not confirmed by the DN
  meeting(4, 'formal', 'scheduled', at(9, 15)), // next
  meeting(5, 'site_visit', 'scheduled', at(10, 5)), // November
];

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

const renderPage = (meetings = MEETINGS) =>
  renderWithProviders(
    <Routes>
      <Route path="/reunions" element={<MeetingsPage />} />
    </Routes>,
    { route: '/reunions', seed: [[queryKeys.meetings.mine(), meetings]] },
  );
const upcoming = () => screen.getByRole('heading', { name: 'À venir' }).closest('section')!;
const history = () => screen.getByRole('heading', { name: 'Historique' }).closest('section')!;

describe('<MeetingsPage>', () => {
  it('lists upcoming meetings nearest first, each with its invitation', () => {
    renderPage();
    const cards = within(upcoming()).getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Dans 9 jours');
    const tickets = within(upcoming()).getAllByRole('link', { name: /invitation/ }).map((a) => a.getAttribute('href'));
    expect(tickets).toEqual(['/api/meetings/4/ticket', '/api/meetings/5/ticket']);
  });

  it('history: unconfirmed past meeting, struck-through reschedule, held meeting with its minutes', () => {
    renderPage();
    const rows = within(history()).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('En attente de confirmation');
    expect(within(rows[0]).queryByRole('link', { name: /invitation/ })).not.toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('Reprogrammée');
    expect(rows[1].querySelector('.line-through')).not.toBeNull();
    expect(rows[2]).toHaveTextContent('Tenue');
    expect(within(rows[2]).getByText('compte-rendu')).toBeInTheDocument();
  });

  it("opens on the next meeting's month and navigates between months", async () => {
    renderPage();
    expect(screen.getByText('octobre 2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mois suivant' }));
    expect(screen.getByText('novembre 2026')).toBeInTheDocument();
  });

  it('selecting a day filters both lists; selecting it again clears the filter', async () => {
    renderPage();
    const day = screen.getByRole('button', { name: /jeudi 15 octobre, réunion à venir/ });
    await userEvent.click(day);
    expect(within(upcoming()).getAllByRole('article')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Historique' })).not.toBeInTheDocument();
    await userEvent.click(day);
    expect(within(upcoming()).getAllByRole('article')).toHaveLength(2);
  });

  it('empty state when there is no meeting at all', () => {
    renderPage([]);
    expect(screen.getByText(/Aucune réunion prévue/)).toBeInTheDocument();
  });
});

describe('<NextMeetingCard> (dashboard)', () => {
  const renderCard = (meetings: ApplicantMeeting[]) =>
    renderWithProviders(<NextMeetingCard />, { seed: [[queryKeys.meetings.mine(), meetings]] });

  it('shows the next meeting with its invitation', () => {
    renderCard(MEETINGS);
    const card = screen.getByRole('region', { name: 'Prochaine réunion' });
    expect(card).toHaveTextContent('dans 9 jours');
    expect(within(card).getByRole('link', { name: /Invitation/ })).toHaveAttribute('href', '/api/meetings/4/ticket');
  });

  it('renders nothing when no meeting is upcoming', () => {
    renderCard(MEETINGS.filter((m) => m.status !== 'scheduled'));
    expect(screen.queryByRole('region', { name: 'Prochaine réunion' })).not.toBeInTheDocument();
  });
});
