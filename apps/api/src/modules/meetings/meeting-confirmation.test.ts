import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MEETING_CONFIRMATION_STATUSES } from '@aidn/shared';
import {
  acceptsMeetingReport,
  canApplicantSubmitSignedReport,
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

describe('SESSION1-MEET-2 report policy', () => {
  it('acceptsMeetingReport: M3/M4 only', () => {
    assert.equal(acceptsMeetingReport('preliminary'), true);
    assert.equal(acceptsMeetingReport('formal'), true);
    assert.equal(acceptsMeetingReport('site_visit'), false);
  });

  it('canApplicantSubmitSignedReport: held M3/M4 with a DN CR on an open dossier, no signed copy yet', () => {
    const held = { meetingType: 'preliminary', status: 'held', crDocumentUrl: '/api/files/1', signedCrDocumentUrl: null };
    assert.equal(
      canApplicantSubmitSignedReport({ ...held, signedCrDocumentUrl: '/api/files/2' }, false),
      false,
      'signed copy already submitted (one upload only)'
    );
    assert.equal(canApplicantSubmitSignedReport(held, false), true);
    assert.equal(canApplicantSubmitSignedReport({ ...held, meetingType: 'formal' }, false), true);
    assert.equal(canApplicantSubmitSignedReport(held, true), false, 'closed dossier');
    assert.equal(canApplicantSubmitSignedReport({ ...held, crDocumentUrl: null }, false), false, 'no DN CR');
    for (const status of ['scheduled', 'no_show', 'rescheduled', 'file_cancelled']) {
      assert.equal(canApplicantSubmitSignedReport({ ...held, status }, false), false, status);
    }
    assert.equal(canApplicantSubmitSignedReport({ ...held, meetingType: 'site_visit' }, false), false, 'M6');
  });
});
