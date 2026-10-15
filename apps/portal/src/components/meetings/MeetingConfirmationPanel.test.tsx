import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../../lib/axios';
import { queryKeys } from '../../lib/react-query/queryKeys';
import type { ApplicantMeeting } from '../../lib/api/meetings.api';
import { renderWithProviders } from '../../test/render';
import { MeetingConfirmationPanel, type ConfirmableMeeting } from './MeetingConfirmationPanel';
import { MeetingsToConfirmBanner } from './MeetingsToConfirmBanner';

const SLOT = '2026-11-03T08:30:00.000Z';
const ALT = '2026-11-05T13:00:00.000Z';

const base: ConfirmableMeeting = {
  id: 21,
  scheduledAt: SLOT,
  location: 'Siège ANAC',
  status: 'scheduled',
  confirmationStatus: 'awaiting_applicant',
  confirmedAt: null,
  alternate: null,
  lastRefusal: null,
  actions: ['confirm', 'propose_alternate'],
  ticketAvailable: false,
};

let post: ReturnType<typeof vi.fn>;
beforeEach(() => {
  post = vi.fn().mockResolvedValue({ data: {} });
  vi.spyOn(api, 'post').mockImplementation(post);
});
afterEach(() => vi.restoreAllMocks());

describe('<MeetingConfirmationPanel>', () => {
  it('proposed: wording, both actions, no invitation', () => {
    renderWithProviders(<MeetingConfirmationPanel meeting={base} />);
    const panel = screen.getByRole('region', { name: 'Rendez-vous proposé' });
    expect(panel).toHaveTextContent('La Direction de la Navigabilité vous propose le rendez-vous suivant.');
    expect(within(panel).getByRole('button', { name: 'Confirmer le rendez-vous' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Proposer une autre date' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /invitation/ })).not.toBeInTheDocument();
  });

  it('confirm posts to the applicant route', async () => {
    renderWithProviders(<MeetingConfirmationPanel meeting={base} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer le rendez-vous' }));
    expect(post).toHaveBeenCalledWith('/meetings/21/confirm');
  });

  it('propose another date: date-time + mandatory remark, sent as an ISO instant', async () => {
    renderWithProviders(<MeetingConfirmationPanel meeting={base} />);
    await userEvent.click(screen.getByRole('button', { name: 'Proposer une autre date' }));
    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Envoyer ma proposition' });
    expect(submit).toBeDisabled();
    const input = within(dialog).getByLabelText('Date et heure proposées');
    await userEvent.type(input, '2030-01-15T14:30');
    expect(submit).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Remarque (obligatoire)'), 'Indisponible le matin');
    await userEvent.click(submit);
    expect(post).toHaveBeenCalledWith('/meetings/21/propose-alternate', {
      scheduledAt: new Date('2030-01-15T14:30').toISOString(),
      remark: 'Indisponible le matin',
    });
  });

  it('awaiting the DN: initial slot, proposed slot, remark, status, no action', () => {
    renderWithProviders(
      <MeetingConfirmationPanel
        meeting={{ ...base, confirmationStatus: 'awaiting_dn', actions: [], alternate: { scheduledAt: ALT, remark: 'Plutôt jeudi' } }}
      />
    );
    const panel = screen.getByRole('region', { name: 'Nouvelle date proposée' });
    expect(panel).toHaveTextContent('Rendez-vous initial');
    expect(panel).toHaveTextContent('Date proposée');
    expect(panel).toHaveTextContent('Votre remarque : Plutôt jeudi');
    expect(panel).toHaveTextContent('En attente de validation par la DN');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('after a refusal: notice with the reason, and both actions again', () => {
    renderWithProviders(
      <MeetingConfirmationPanel
        meeting={{ ...base, lastRefusal: { reason: 'Agenda complet', proposedSlotAt: ALT, refusedAt: SLOT } }}
      />
    );
    expect(screen.getByText("La date proposée n'a pas été retenue par la DN.")).toBeInTheDocument();
    expect(screen.getByText('Motif : Agenda complet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmer le rendez-vous' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Proposer une autre date' })).toBeInTheDocument();
  });

  it('confirmed: final slot and the invitation', () => {
    renderWithProviders(
      <MeetingConfirmationPanel meeting={{ ...base, confirmationStatus: 'confirmed', actions: [], ticketAvailable: true, confirmedAt: SLOT }} />
    );
    expect(screen.getByRole('region', { name: 'Rendez-vous confirmé' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /invitation/ })).toHaveAttribute('href', '/api/meetings/21/ticket');
  });

  it('closed dossier (no action sent by the API): read-only', () => {
    renderWithProviders(<MeetingConfirmationPanel meeting={{ ...base, actions: [] }} />);
    expect(screen.getByRole('region', { name: 'Rendez-vous proposé' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('<MeetingsToConfirmBanner>', () => {
  const mine = (over: Partial<ApplicantMeeting>): ApplicantMeeting => ({
    ...base,
    meetingType: 'preliminary',
    phaseCode: 'M3',
    requestId: 4,
    requestReference: 'DEM-2026-10-14-OMA-01',
    requestType: 'issuance',
    crDocumentUrl: null,
    ...over,
  });

  it('shows « Rendez-vous à confirmer » while an answer is expected', () => {
    renderWithProviders(<MeetingsToConfirmBanner />, { seed: [[queryKeys.meetings.mine(), [mine({})]]] });
    expect(screen.getByText('Rendez-vous à confirmer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Répondre' })).toHaveAttribute('href', '/reunions');
  });

  it('stays hidden when nothing waits for the applicant', () => {
    renderWithProviders(<MeetingsToConfirmBanner />, {
      seed: [[queryKeys.meetings.mine(), [mine({ confirmationStatus: 'awaiting_dn', actions: [] })]]],
    });
    expect(screen.queryByText(/Rendez-vous à confirmer/)).not.toBeInTheDocument();
  });
});
