import type { MeetingNegotiationView } from '../lib/api/meetings.types';

/** SESSION1-MEET-1 - a settled appointment (legacy meetings are confirmed). */
export const CONFIRMED_NEGOTIATION: MeetingNegotiationView = {
  confirmationStatus: 'confirmed',
  confirmedAt: '2026-10-01T08:00:00.000Z',
  alternate: null,
  waitingSince: null,
  waitingDays: null,
  alternateSlotTaken: false,
  availableNegotiationActions: [],
};
