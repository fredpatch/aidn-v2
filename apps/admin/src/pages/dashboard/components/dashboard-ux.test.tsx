/** DASH-DN-UX-1 - the dashboard reads durations like /analytique (no decimal
 *  days) and names the dossier of each recent event, linked when allowed. */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardActivityItem, DashboardPhaseStat } from '../../../lib/api/dashboard.types';
import { WorkflowPhaseSummary } from './WorkflowPhaseSummary';
import { ActivityTimeline } from './ActivityTimeline';
import { DashboardMetricCard } from './DashboardMetricCard';

const phase = (phaseCode: string, extra: Partial<DashboardPhaseStat>): DashboardPhaseStat => ({
  phaseCode,
  label: `Phase ${phaseCode}`,
  count: 0,
  percentage: 0,
  averageDurationDays: null,
  slaTargetDays: 15,
  slaTargetLabel: 'Cible SLA : 15 jours calendaires',
  ...extra,
});

describe('WorkflowPhaseSummary', () => {
  it('averages as « Moyenne : 16 h 48 min » / « 8 j 22 h », the empty wording, and the SLA target line', () => {
    const { container } = render(
      <WorkflowPhaseSummary
        phases={[
          phase('M3', { averageDurationDays: 0.7, count: 2, percentage: 50, slaStatus: 'on_track', slaLabel: 'Dans les temps' }),
          phase('M4', { averageDurationDays: 8.9 }),
          phase('M5', { averageDurationDays: null, durationLabel: 'Pas encore de durée clôturée' }),
        ]}
      />
    );
    expect(screen.getByText('Moyenne : 16 h 48 min')).toBeInTheDocument();
    expect(screen.getByText('Moyenne : 8 j 22 h')).toBeInTheDocument();
    expect(screen.getByText('Pas encore de durée clôturée')).toBeInTheDocument();
    expect(screen.getByText('Dans les temps')).toBeInTheDocument();
    expect(screen.getAllByText('Cible SLA : 15 jours calendaires')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/\d\.\d j|j moyen/);
  });
});

const activity = (extra: Partial<DashboardActivityItem>): DashboardActivityItem => ({
  id: 1,
  title: 'Paiement validé',
  requestId: 123,
  requestReference: 'DEM-2026-10-05-OMAT-02',
  href: '/demandes?id=123',
  actor: 'Agent Finance',
  createdAt: '2026-10-19T11:45:00.000Z',
  tone: 'success',
  ...extra,
});

describe('DashboardMetricCard - samples (ANALYTICS-SAMPLE-CLARITY-2)', () => {
  const card = (metric: Parameters<typeof DashboardMetricCard>[0]['metric']) =>
    render(
      <MemoryRouter>
        <DashboardMetricCard metric={metric} />
      </MemoryRouter>
    );

  it.each([
    ['active_requests', 'Dossiers actifs'],
    ['open_phases', 'Phases ouvertes'],
    ['pending_payments', 'Paiements bloquants'],
  ])('direct count %s: « État actuel » only, no « base N »', (key, label) => {
    const { container } = card({ key, label, value: 4, periodLabel: 'État actuel', sampleSize: 18 });
    expect(screen.getByText('État actuel')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/base|18/);
  });

  it('global duration: « Historique des retraits · 2 dossiers avec certificat retiré »', () => {
    const { container } = card({
      key: 'average_global_duration',
      label: 'Durée moyenne globale',
      value: '4 j 22 h',
      rawValue: 4.9,
      unit: 'calendar_days',
      periodLabel: 'Historique des retraits',
      sampleSize: 2,
      sampleLabel: '2 dossiers avec certificat retiré',
    });
    expect(screen.getByText('Historique des retraits · 2 dossiers avec certificat retiré')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/base/);
  });
});

describe('ActivityTimeline', () => {
  it('resolved event: the DEM reference links to the dossier; date and actor stay visible', () => {
    render(
      <MemoryRouter>
        <ActivityTimeline activity={[activity({})]} />
      </MemoryRouter>
    );
    expect(screen.getByText('Paiement validé')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'DEM-2026-10-05-OMAT-02' })).toHaveAttribute('href', '/demandes?id=123');
    expect(screen.getByText(/Agent Finance/)).toBeInTheDocument();
    expect(screen.getByText(/19\/10\/2026/)).toBeInTheDocument();
  });

  it('reference without link when the viewer may not open the dossier', () => {
    render(
      <MemoryRouter>
        <ActivityTimeline activity={[activity({ href: undefined })]} />
      </MemoryRouter>
    );
    expect(screen.getByText('DEM-2026-10-05-OMAT-02')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('unresolved event: no dossier line and no technical id, action / date / actor still shown', () => {
    const { container } = render(
      <MemoryRouter>
        <ActivityTimeline activity={[activity({ id: 17, title: 'Certificat généré', requestId: null, requestReference: null, href: undefined })]} />
      </MemoryRouter>
    );
    expect(screen.getByText('Certificat généré')).toBeInTheDocument();
    expect(screen.getByText(/Agent Finance/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/#\d+|DEM-/);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
