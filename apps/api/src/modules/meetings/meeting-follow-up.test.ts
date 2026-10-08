import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { awaitsR3Opinion, isActiveDossier, lacksMeetingReport } from './meeting-follow-up.js';

const held = (meetingType: 'preliminary' | 'formal' | 'site_visit', crDocumentUrl: string | null = null) => ({
  meetingType,
  status: 'held',
  crDocumentUrl,
});

describe('K6 meeting follow-up rule', () => {
  it('active dossiers are every status except completed, cancelled and rejected', () => {
    for (const status of ['submitted', 'signed', 'pending_review', 'in_progress']) assert.ok(isActiveDossier(status), status);
    for (const status of ['completed', 'cancelled', 'rejected']) assert.ok(!isActiveDossier(status), status);
  });

  describe('lacksMeetingReport', () => {
    it('preliminary and formal meetings held without a compte-rendu', () => {
      assert.ok(lacksMeetingReport(held('preliminary'), 'in_progress'));
      assert.ok(lacksMeetingReport(held('formal'), 'in_progress'));
    });
    it('not once the compte-rendu is uploaded', () => {
      assert.ok(!lacksMeetingReport(held('preliminary', '/api/files/cr.pdf'), 'in_progress'));
    });
    it('never a site visit: it has no compte-rendu', () => {
      assert.ok(!lacksMeetingReport(held('site_visit'), 'in_progress'));
    });
    it('only held meetings', () => {
      for (const status of ['scheduled', 'no_show', 'rescheduled', 'file_cancelled']) {
        assert.ok(!lacksMeetingReport({ ...held('formal'), status }, 'in_progress'), status);
      }
    });
    it('not on a closed dossier', () => {
      for (const status of ['completed', 'cancelled', 'rejected']) {
        assert.ok(!lacksMeetingReport(held('formal'), status), status);
      }
    });
  });

  describe('awaitsR3Opinion', () => {
    it('a site visit held, opinion not submitted', () => {
      assert.ok(awaitsR3Opinion(held('site_visit'), 'in_progress', false));
    });
    it('not once the opinion is submitted', () => {
      assert.ok(!awaitsR3Opinion(held('site_visit'), 'in_progress', true));
    });
    it('only site visits, only held, only active dossiers', () => {
      assert.ok(!awaitsR3Opinion(held('formal'), 'in_progress', false));
      assert.ok(!awaitsR3Opinion({ ...held('site_visit'), status: 'scheduled' }, 'in_progress', false));
      assert.ok(!awaitsR3Opinion(held('site_visit'), 'rejected', false));
    });
  });
});
