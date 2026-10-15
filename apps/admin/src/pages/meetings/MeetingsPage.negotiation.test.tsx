/** SESSION1-MEET-1 - Réunions page: appointments waiting on someone are
 *  listed with the shared negotiation card, unconfirmed slots are badged,
 *  and held / no-show stay hidden until the appointment is confirmed. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { api } from '../../lib/axios';
import type { MeetingCockpitItem, MeetingCockpitSummary, MeetingNegotiationView } from '../../lib/api/meetings.types';
import { renderWithProviders } from '../../test/render';
import { CONFIRMED_NEGOTIATION } from '../../test/meetingFixtures';
import MeetingsPage from './MeetingsPage';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles: ['dn_agent'] } }) }));

const AT = '2026-10-02T08:00:00.000Z';
const SOON = new Date(Date.now() + 86_400_000).toISOString();

const counterProposal: MeetingNegotiationView = {
  ...CONFIRMED_NEGOTIATION,
  confirmationStatus: 'awaiting_dn',
  confirmedAt: null,
  alternate: { scheduledAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), remark: 'Indisponible ce jour' },
  waitingSince: AT,
  waitingDays: 2,
  availableNegotiationActions: ['accept_alternate', 'refuse_alternate'],
};

const item = (over: Partial<MeetingCockpitItem>): MeetingCockpitItem => ({
  id: 7, phaseId: 3, phaseCode: 'M3', phaseLabel: 'Préliminaire', phaseStatus: 'open', requestId: 1,
  requestReference: 'DEM-MEET-01', requestType: 'issuance', organisationName: 'OMA Meet', applicantName: 'P',
  meetingType: 'preliminary', meetingTypeLabel: 'Réunion préliminaire', status: 'scheduled', statusLabel: 'Planifiée',
  scheduledAt: SOON, location: 'Salle B', dnAgentId: 5, dnAgentName: 'Agent DN', crDocumentUrl: null, crUploadedAt: null,
  ticketUrl: '/api/meetings/7/ticket', phaseHref: '/demandes/1/phase-preliminaire', canManage: true,
  actionLabel: 'Répondre à la contre-proposition', dossierStatus: 'in_progress', dossierClosed: false,
  negotiation: counterProposal, ...over,
});

function cockpit(items: MeetingCockpitItem[], pending: MeetingCockpitItem[]): MeetingCockpitSummary {
  return {
    periodStart: AT,
    periodEnd: AT,
    metrics: [
      { key: 'counter_proposals', label: 'Contre-propositions à traiter', value: pending.length, helper: '', tone: 'warning' },
    ],
    items,
    upcoming: items,
    missingReports: [],
    pendingNegotiations: pending,
    updatedAt: AT,
  };
}

let summary: MeetingCockpitSummary;
beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation(async () => ({ data: summary }));
});
afterEach(() => vi.restoreAllMocks());

describe('<MeetingsPage> negotiation', () => {
  it('lists counter-proposals to handle, with the shared card and the metric', async () => {
    const pending = item({});
    summary = cockpit([pending], [pending]);
    renderWithProviders(<MeetingsPage />);
    const section = (await screen.findByText('Rendez-vous à traiter')).closest('section')!;
    expect(within(section).getByText('Contre-proposition du postulant')).toBeInTheDocument();
    expect(within(section).getByText('Indisponible ce jour')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: /Accepter cette date/ })).toBeInTheDocument();
    expect(screen.getByText('Contre-propositions à traiter')).toBeInTheDocument();
  });

  it('unconfirmed slot: badge in the list, no held / absence actions, no ticket', async () => {
    const pending = item({});
    summary = cockpit([pending], []);
    renderWithProviders(<MeetingsPage />);
    fireEvent.click(await screen.findByText('Liste'));
    fireEvent.click(await screen.findByText('DEM-MEET-01'));
    expect(screen.getAllByText('Contre-proposition').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Enregistrer la tenue/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Absence constatée/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Voir le ticket')).not.toBeInTheDocument();
    expect(screen.getByText('Reporter la réunion')).toBeInTheDocument();
  });

  it('confirmed slot: usual actions, no badge', async () => {
    const confirmed = item({ negotiation: CONFIRMED_NEGOTIATION, actionLabel: 'Résoudre la réunion' });
    summary = cockpit([confirmed], []);
    renderWithProviders(<MeetingsPage />);
    fireEvent.click(await screen.findByText('Liste'));
    fireEvent.click(await screen.findByText('DEM-MEET-01'));
    expect(screen.getByRole('button', { name: /Enregistrer la tenue/ })).toBeInTheDocument();
    expect(screen.getByText('Voir le ticket')).toBeInTheDocument();
    expect(screen.queryByText('À confirmer')).not.toBeInTheDocument();
    expect(screen.queryByText('Rendez-vous à traiter')).not.toBeInTheDocument();
  });
});
