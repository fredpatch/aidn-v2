/** SESSION1-MEET-1 - M3 and M4 workspaces use the shared negotiation card and
 *  only offer held / no-show / cancel once the appointment is confirmed. */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/render';
import { CONFIRMED_NEGOTIATION } from '../../test/meetingFixtures';
import type { MeetingNegotiationView } from '../../lib/api/meetings.types';
import MeetingCard from './preliminary/components/MeetingCard';
import FormalMeetingCard from './formal/components/FormalMeetingCard';

const AT = '2026-11-03T08:30:00.000Z';
const noop = vi.fn();

const awaitingDn: MeetingNegotiationView = {
  ...CONFIRMED_NEGOTIATION,
  confirmationStatus: 'awaiting_dn',
  confirmedAt: null,
  alternate: { scheduledAt: '2026-11-05T13:00:00.000Z', remark: 'Le matin' },
  waitingDays: 1,
  waitingSince: AT,
  availableNegotiationActions: ['accept_alternate', 'refuse_alternate'],
};

const meeting = (negotiation: MeetingNegotiationView) => ({
  id: 5,
  scheduledAt: AT,
  location: null,
  status: 'scheduled',
  crDocumentUrl: null,
  crUploadedAt: null,
  signedCrDocumentUrl: null,
  signedCrUploadedAt: null,
  negotiation,
});

describe('M3 / M4 meeting cards', () => {
  it('M3 counter-proposal: negotiation actions, no held / no-show / ticket', () => {
    renderWithProviders(
      <MeetingCard phaseId={2} meeting={meeting(awaitingDn)} dnAgentId={1} requestId="9" setActionError={noop} />
    );
    expect(screen.getByRole('button', { name: /Accepter cette date/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tenue/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /No-show/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Voir le ticket')).not.toBeInTheDocument();
  });

  it('M3 confirmed: the usual actions are back', () => {
    renderWithProviders(
      <MeetingCard phaseId={2} meeting={meeting(CONFIRMED_NEGOTIATION)} dnAgentId={1} requestId="9" setActionError={noop} />
    );
    expect(screen.getByRole('button', { name: /Tenue/ })).toBeInTheDocument();
    expect(screen.getByText('Voir le ticket')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accepter cette date/ })).not.toBeInTheDocument();
  });

  it('M4 awaiting the applicant: on-behalf confirmation offered, no held / no-show', () => {
    renderWithProviders(
      <FormalMeetingCard
        phaseId={3}
        meeting={meeting({
          ...CONFIRMED_NEGOTIATION,
          confirmationStatus: 'awaiting_applicant',
          confirmedAt: null,
          availableNegotiationActions: ['confirm_on_behalf'],
        })}
        dnAgentId={1}
        requestId="9"
        letterReturned
        canManage
        setActionError={noop}
      />
    );
    expect(screen.getByText('En attente du postulant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmer au nom du postulant/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Replanifier/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tenue/ })).not.toBeInTheDocument();
  });
});
