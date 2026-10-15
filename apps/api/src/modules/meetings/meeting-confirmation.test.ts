import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MEETING_CONFIRMATION_STATUSES } from '@aidn/shared';
import {
  canApplicantRespond,
  initialConfirmationStatus,
  isConfirmedScheduledMeeting,
  isMeetingOperationallyConfirmed,
  requiresApplicantConfirmation,
} from './meeting-confirmation.js';

describe('meeting confirmation policy', () => {
  it('applies to M3 and M4 only', () => {
    assert.equal(requiresApplicantConfirmation('preliminary'), true);
    assert.equal(requiresApplicantConfirmation('formal'), true);
    assert.equal(requiresApplicantConfirmation('site_visit'), false);
  });

  it('starts a DN proposal awaiting the applicant, a site visit not_required', () => {
    assert.equal(initialConfirmationStatus('preliminary'), 'awaiting_applicant');
    assert.equal(initialConfirmationStatus('formal'), 'awaiting_applicant');
    assert.equal(initialConfirmationStatus('site_visit'), 'not_required');
  });

  it('is operationally confirmed only when confirmed or not_required', () => {
    const confirmed = MEETING_CONFIRMATION_STATUSES.filter((confirmationStatus) =>
      isMeetingOperationallyConfirmed({ confirmationStatus })
    );
    assert.deepEqual(confirmed, ['confirmed', 'not_required']);
  });

  it('lets the applicant respond only to a scheduled meeting awaiting them', () => {
    for (const confirmationStatus of MEETING_CONFIRMATION_STATUSES) {
      for (const status of ['scheduled', 'held', 'no_show', 'rescheduled', 'file_cancelled']) {
        const expected = status === 'scheduled' && confirmationStatus === 'awaiting_applicant';
        assert.equal(canApplicantRespond({ status, confirmationStatus }), expected, `${status}/${confirmationStatus}`);
      }
    }
  });

  it('treats only scheduled + operationally confirmed meetings as confirmed appointments', () => {
    assert.equal(isConfirmedScheduledMeeting({ status: 'scheduled', confirmationStatus: 'confirmed' }), true);
    assert.equal(isConfirmedScheduledMeeting({ status: 'scheduled', confirmationStatus: 'not_required' }), true);
    assert.equal(isConfirmedScheduledMeeting({ status: 'scheduled', confirmationStatus: 'awaiting_dn' }), false);
    assert.equal(isConfirmedScheduledMeeting({ status: 'held', confirmationStatus: 'confirmed' }), false);
  });
});
