import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { AnalyticsBlockingPoint, AnalyticsMeetingFollowUp } from '../../../lib/api/analytics.types';
import { renderWithProviders } from '../../../test/render';
import { BlockingPointGrid } from './BlockingPointGrid';
import { MeetingFollowUpsSection, followUpPhasePath } from './MeetingFollowUpsSection';

const item = (over: Partial<AnalyticsMeetingFollowUp>): AnalyticsMeetingFollowUp => ({
  meetingId: 1,
  requestId: 10,
  reference: 'DEM-K6-01',
  organisationName: 'OMA Libreville',
  meetingType: 'preliminary',
  phaseCode: 'M3',
  scheduledAt: '2026-09-15T08:00:00.000Z',
  agentName: 'Agent DN',
  ...over,
});

const reports = [
  item({ meetingId: 1, requestId: 10, reference: 'DEM-K6-01', meetingType: 'preliminary', phaseCode: 'M3' }),
  item({ meetingId: 2, requestId: 11, reference: 'DEM-K6-02', meetingType: 'formal', phaseCode: 'M4', agentName: null }),
];
const opinions = [
  item({ meetingId: 3, requestId: 12, reference: 'DEM-K6-03', meetingType: 'site_visit', phaseCode: 'M6', agentName: 'Agent R3 Mba' }),
];

describe('<MeetingFollowUpsSection> (K6)', () => {
  it('lists each meeting where an action may be needed, with a link to its phase', () => {
    renderWithProviders(<MeetingFollowUpsSection followUps={{ missingReports: reports, missingR3Opinions: opinions }} />);

    const reportTable = screen.getByRole('table', { name: 'Comptes-rendus non déposés' });
    const rows = within(reportTable).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('DEM-K6-01')).toBeInTheDocument();
    expect(within(rows[0]).getByText('OMA Libreville')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Préliminaire')).toBeInTheDocument();
    expect(within(rows[0]).getByText('15/09/2026')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Agent DN')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Formelle')).toBeInTheDocument();
    expect(within(rows[1]).getByText('-')).toBeInTheDocument();

    const link = (reference: string) =>
      screen.getByRole('link', { name: `Ouvrir la phase du dossier ${reference}` });
    expect(link('DEM-K6-01')).toHaveAttribute('href', '/demandes/10/phase-preliminaire');
    expect(link('DEM-K6-02')).toHaveAttribute('href', '/demandes/11/phase-formelle');
    expect(link('DEM-K6-03')).toHaveAttribute('href', '/demandes/12/demonstration-inspection');

    const opinionTable = screen.getByRole('table', { name: 'Avis R3 en attente' });
    expect(within(within(opinionTable).getAllByRole('row')[1]).getByText('Agent R3 Mba')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Comptes-rendus non déposés · 2/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Avis R3 en attente · 1/ })).toBeInTheDocument();
  });

  it('says so when there is nothing to follow, instead of an empty table', () => {
    renderWithProviders(<MeetingFollowUpsSection followUps={{ missingReports: [], missingR3Opinions: [] }} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByText('Rien à suivre pour le moment.')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Suivi des réunions' })).toHaveAttribute('id', 'suivi-reunions');
  });

  it('the phase path depends only on the meeting type', () => {
    expect(followUpPhasePath(item({ requestId: 5, meetingType: 'preliminary' }))).toBe('/demandes/5/phase-preliminaire');
    expect(followUpPhasePath(item({ requestId: 5, meetingType: 'formal' }))).toBe('/demandes/5/phase-formelle');
    expect(followUpPhasePath(item({ requestId: 5, meetingType: 'site_visit' }))).toBe('/demandes/5/demonstration-inspection');
  });
});

describe('<BlockingPointGrid> meeting cards (K6)', () => {
  const point = (key: string, label: string, tone: AnalyticsBlockingPoint['tone'], href = '/reunions') => ({
    key,
    label,
    value: '2',
    helper: `${label} aide`,
    tone,
    href,
  });

  it('the two meeting cards point to their list on this page, the others keep their page link', () => {
    renderWithProviders(
      <BlockingPointGrid
        points={[
          point('delayed_phases', 'Phases en depassement', 'danger', '/demandes'),
          point('missing_reports', 'Reunions sans compte-rendu', 'info'),
          point('missing_r3_opinions', 'Avis R3 manquant', 'info'),
        ]}
      />
    );
    expect(screen.getByRole('link', { name: /Voir les réunions/ })).toHaveAttribute('href', '#suivi-reunions');
    expect(screen.getByRole('link', { name: /Voir les visites/ })).toHaveAttribute('href', '#suivi-reunions');
    expect(screen.getByRole('link', { name: /Voir la liste/ })).toHaveAttribute('href', '/demandes');
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('neutral tone: no alert styling on the meeting cards', () => {
    renderWithProviders(
      <BlockingPointGrid
        points={[point('missing_reports', 'Reunions sans compte-rendu', 'info'), point('missing_r3_opinions', 'Avis R3 manquant', 'info')]}
      />
    );
    for (const label of ['Reunions sans compte-rendu', 'Avis R3 manquant']) {
      const card = screen.getByText(label).closest('article')!;
      expect(card.className).toContain('bg-blue-50');
      expect(card.className).not.toMatch(/red|orange/);
    }
  });
});
