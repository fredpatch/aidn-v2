/** GET /meetings/:id for an applicant: no internal staff id (for a site visit,
 *  dnAgentId is the assigned R3 agent), plus the SESSION1-MEET-1 negotiation
 *  block - never the DN's notes nor the raw event history. Pure functions. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toApplicantMeetingView } from './applicant-view.js';
import { buildApplicantBlock, type ApplicantNegotiationBlock } from './meeting-negotiation.view.js';
import type { NegotiationEventRow } from './meeting-negotiation.events.js';
import type { MeetingRow } from './meeting-write.js';
import type { MeetingView } from './meetings.types.js';

const AT = new Date('2026-10-13T08:00:00Z');
const ALT = new Date('2026-10-15T09:30:00Z');
const view = (): MeetingView => ({
  id: 7,
  phaseId: 6,
  meetingType: 'site_visit',
  dnAgentId: 42,
  scheduledAt: AT,
  location: 'Hangar 3',
  status: 'scheduled',
  confirmationStatus: 'not_required',
  confirmedAt: null,
  crDocumentUrl: null,
  crUploadedAt: null,
  createdAt: AT,
});
const block = (): ApplicantNegotiationBlock => ({
  confirmationStatus: 'not_required',
  confirmedAt: null,
  alternate: null,
  lastRefusal: null,
  actions: [],
  ticketAvailable: true,
});

function meetingRow(overrides: Partial<MeetingRow>): MeetingRow {
  return {
    id: 9,
    phaseId: 3,
    meetingType: 'preliminary',
    dnAgentId: 42,
    scheduledAt: AT,
    location: null,
    status: 'scheduled',
    ticketDocumentUrl: null,
    crDocumentUrl: null,
    crUploadedAt: null,
    createdAt: AT,
    confirmationStatus: 'awaiting_applicant',
    alternateScheduledAt: null,
    alternateRemark: null,
    confirmedAt: null,
    ...overrides,
  };
}

function event(overrides: Partial<NegotiationEventRow>): NegotiationEventRow {
  return {
    id: 1,
    meetingId: 9,
    kind: 'dn_proposed',
    slotAt: AT,
    remark: null,
    reason: null,
    resultingMeetingId: null,
    actorUserId: 42,
    actorApplicantId: null,
    createdAt: AT,
    ...overrides,
  };
}

describe('toApplicantMeetingView', () => {
  it('drops dnAgentId and keeps every other field plus the negotiation block', () => {
    const expected: Record<string, unknown> = { ...view(), ...block() };
    delete expected.dnAgentId;
    assert.deepEqual(toApplicantMeetingView(view(), block()), expected);
    assert.doesNotMatch(JSON.stringify(toApplicantMeetingView(view(), block())), /dnAgentId|:42\b/);
  });

  it('whitelist: a field added to MeetingView or to the block later is not passed through', () => {
    const source = { ...view(), internalNote: 'secret' } as MeetingView;
    const extra = { ...block(), history: [{ remark: 'Confirmé par téléphone' }] } as ApplicantNegotiationBlock;
    assert.doesNotMatch(JSON.stringify(toApplicantMeetingView(source, extra)), /internalNote|secret|history|téléphone/);
  });
});

describe('buildApplicantBlock', () => {
  it('awaiting the applicant: both actions, no ticket', () => {
    const result = buildApplicantBlock(meetingRow({}), event({}), false);
    assert.deepEqual(result.actions, ['confirm', 'propose_alternate']);
    assert.equal(result.ticketAvailable, false);
    assert.equal(result.lastRefusal, null);
  });

  it('closed dossier: no action', () => {
    assert.deepEqual(buildApplicantBlock(meetingRow({}), event({}), true).actions, []);
  });

  it('awaiting the DN: shows the own proposal, no action', () => {
    const result = buildApplicantBlock(
      meetingRow({ confirmationStatus: 'awaiting_dn', alternateScheduledAt: ALT, alternateRemark: 'Plutôt le matin' }),
      event({ kind: 'applicant_alternate_proposed', actorUserId: null, actorApplicantId: 5, slotAt: ALT, remark: 'Plutôt le matin' }),
      false
    );
    assert.deepEqual(result.alternate, { scheduledAt: ALT.toISOString(), remark: 'Plutôt le matin' });
    assert.deepEqual(result.actions, []);
  });

  it('after a DN refusal: the latest refusal is shown with the refused slot', () => {
    const refusedAt = new Date('2026-10-14T10:00:00Z');
    const result = buildApplicantBlock(
      meetingRow({}),
      event({ kind: 'dn_alternate_refused', slotAt: ALT, reason: 'Agenda complet', createdAt: refusedAt }),
      false
    );
    assert.deepEqual(result.lastRefusal, {
      reason: 'Agenda complet',
      proposedSlotAt: ALT.toISOString(),
      refusedAt: refusedAt.toISOString(),
    });
    assert.deepEqual(result.actions, ['confirm', 'propose_alternate']);
  });

  it('a refusal superseded by a newer step is no longer shown', () => {
    const awaitingDn = meetingRow({ confirmationStatus: 'awaiting_dn', alternateScheduledAt: ALT, alternateRemark: 'r2' });
    const latest = event({ kind: 'applicant_alternate_proposed', actorUserId: null, actorApplicantId: 5, slotAt: ALT, remark: 'r2' });
    assert.equal(buildApplicantBlock(awaitingDn, latest, false).lastRefusal, null);
  });

  it('confirmed or not_required live meetings expose the ticket; superseded rows never do', () => {
    assert.equal(buildApplicantBlock(meetingRow({ confirmationStatus: 'confirmed', confirmedAt: AT }), undefined, false).ticketAvailable, true);
    assert.equal(
      buildApplicantBlock(meetingRow({ meetingType: 'site_visit', confirmationStatus: 'not_required' }), undefined, false).ticketAvailable,
      true
    );
    assert.equal(
      buildApplicantBlock(meetingRow({ status: 'rescheduled', confirmationStatus: 'confirmed', confirmedAt: AT }), undefined, false)
        .ticketAvailable,
      false
    );
  });
});

describe('getMeeting - wiring', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const service = fs.readFileSync(path.join(dir, 'meetings.service.ts'), 'utf8');
  const fn = service.slice(service.indexOf('export async function getMeeting('));
  // Same robust bound as the site-inspection wiring test: '\n}\n' can miss
  // (indented closers; no trailing newline after the final '}').
  const nextExport = fn.indexOf('\nexport ', 1);
  const body = nextExport === -1 ? fn : fn.slice(0, nextExport);

  it('an applicant actor gets the applicant view, staff the full view with the negotiation', () => {
    assert.match(body, /if \(actor\.applicant\) \{[\s\S]*return toApplicantMeetingView\(view, /);
    assert.match(body, /negotiationViewsFor\(\[meeting\]/);
  });
});
