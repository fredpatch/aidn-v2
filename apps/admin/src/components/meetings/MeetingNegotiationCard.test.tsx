import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { api } from '../../lib/axios';
import type { MeetingNegotiationView } from '../../lib/api/meetings.types';
import { renderWithProviders } from '../../test/render';
import { CONFIRMED_NEGOTIATION } from '../../test/meetingFixtures';
import { MeetingNegotiationCard } from './MeetingNegotiationCard';

const MEETING = { id: 12, scheduledAt: '2026-11-03T08:30:00.000Z' };
const ALTERNATE = '2026-11-05T13:00:00.000Z';

const awaitingApplicant: MeetingNegotiationView = {
  ...CONFIRMED_NEGOTIATION,
  confirmationStatus: 'awaiting_applicant',
  confirmedAt: null,
  waitingSince: '2026-10-11T08:00:00.000Z',
  waitingDays: 3,
  availableNegotiationActions: ['confirm_on_behalf'],
};

const awaitingDn: MeetingNegotiationView = {
  ...CONFIRMED_NEGOTIATION,
  confirmationStatus: 'awaiting_dn',
  confirmedAt: null,
  alternate: { scheduledAt: ALTERNATE, remark: 'Indisponible le matin' },
  waitingSince: '2026-10-14T08:00:00.000Z',
  waitingDays: 0,
  availableNegotiationActions: ['accept_alternate', 'refuse_alternate'],
};

function renderCard(negotiation: MeetingNegotiationView, extra: Partial<Parameters<typeof MeetingNegotiationCard>[0]> = {}) {
  const onChanged = vi.fn();
  const setActionError = vi.fn();
  renderWithProviders(
    <MeetingNegotiationCard
      meeting={MEETING}
      negotiation={negotiation}
      setActionError={setActionError}
      onChanged={onChanged}
      {...extra}
    />
  );
  return { onChanged, setActionError };
}

describe('MeetingNegotiationCard', () => {
  let post: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    post = vi.fn().mockResolvedValue({ data: { softOverlapWarning: false } });
    vi.spyOn(api, 'post').mockImplementation(post);
  });
  afterEach(() => vi.restoreAllMocks());

  it('awaiting the applicant: badge, waiting time, reschedule and on-behalf, no held/no-show', () => {
    const onReschedule = vi.fn();
    renderCard(awaitingApplicant, { onReschedule });
    expect(screen.getByText('En attente du postulant')).toBeInTheDocument();
    expect(screen.getByText('depuis 3 jours')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Replanifier/ }));
    expect(onReschedule).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Confirmer au nom du postulant/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tenue|No-show|Accepter/ })).not.toBeInTheDocument();
  });

  it('confirm on behalf requires a note and posts it', async () => {
    const { onChanged } = renderCard(awaitingApplicant);
    fireEvent.click(screen.getByRole('button', { name: /Confirmer au nom du postulant/ }));
    const submit = screen.getByRole('button', { name: 'Enregistrer la confirmation' });
    expect(screen.getByLabelText('Comment la confirmation a-t-elle été reçue ? (téléphone, courrier…)')).toBeInTheDocument();
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Appel du 14/10  ' } });
    fireEvent.click(submit);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/meetings/12/confirm-on-behalf', { note: 'Appel du 14/10' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('counter-proposal: initial slot, proposed slot, remark, accept and refuse', async () => {
    const { onChanged } = renderCard(awaitingDn);
    const region = screen.getByRole('region', { name: 'Contre-proposition du postulant' });
    expect(region).toHaveTextContent('Rendez-vous initial');
    expect(region).toHaveTextContent('Date proposée');
    expect(region).toHaveTextContent('Indisponible le matin');
    fireEvent.click(screen.getByRole('button', { name: /Accepter cette date/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/meetings/12/alternate/accept'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('refusal opens a mandatory reason', async () => {
    renderCard(awaitingDn);
    fireEvent.click(screen.getByRole('button', { name: /Refuser/ }));
    expect(screen.getByLabelText('Motif du refus')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Confirmer le refus' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Agenda complet' } });
    fireEvent.click(submit);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/meetings/12/alternate/refuse', { reason: 'Agenda complet' }));
  });

  it('a taken slot disables the accept button (the server still enforces it)', () => {
    renderCard({ ...awaitingDn, alternateSlotTaken: true });
    expect(screen.getByRole('button', { name: /Accepter cette date/ })).toBeDisabled();
    expect(screen.getByText(/déjà occupé/)).toBeInTheDocument();
  });

  it('read-only (closed dossier): state shown, no action', () => {
    renderCard(awaitingDn, { readOnly: true });
    expect(screen.getByText('Contre-proposition du postulant')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('confirmed: no negotiation control, history available', () => {
    renderCard({
      ...CONFIRMED_NEGOTIATION,
      history: [
        {
          kind: 'dn_proposed',
          label: 'Rendez-vous proposé par la DN',
          meetingId: 12,
          slotAt: MEETING.scheduledAt,
          remark: null,
          reason: null,
          actor: { type: 'dn', name: 'Agent DN' },
          createdAt: '2026-10-10T08:00:00.000Z',
          resultingMeetingId: null,
        },
        {
          kind: 'dn_alternate_refused',
          label: 'Date proposée refusée par la DN',
          meetingId: 12,
          slotAt: ALTERNATE,
          remark: null,
          reason: 'Agenda complet',
          actor: { type: 'dn', name: 'Agent DN' },
          createdAt: '2026-10-11T08:00:00.000Z',
          resultingMeetingId: null,
        },
      ],
    });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Historique du rendez-vous')).toBeInTheDocument();
    expect(screen.getByText(/Motif : Agenda complet/)).toBeInTheDocument();
  });
});
