/** GET /meetings/:id for an applicant: no internal staff id (for a site visit,
 *  dnAgentId is the assigned R3 agent). Pure function, no database. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toApplicantMeetingView } from './applicant-view.js';
import type { MeetingView } from './meetings.types.js';

const AT = new Date('2026-10-13T08:00:00Z');
const view = (): MeetingView => ({
  id: 7,
  phaseId: 6,
  meetingType: 'site_visit',
  dnAgentId: 42,
  scheduledAt: AT,
  location: 'Hangar 3',
  status: 'scheduled',
  crDocumentUrl: null,
  crUploadedAt: null,
  createdAt: AT,
});

describe('toApplicantMeetingView', () => {
  it('drops dnAgentId and keeps every other field', () => {
    const expected: Record<string, unknown> = { ...view() };
    delete expected.dnAgentId;
    assert.deepEqual(toApplicantMeetingView(view()), expected);
    assert.doesNotMatch(JSON.stringify(toApplicantMeetingView(view())), /dnAgentId|:42\b/);
  });

  it('whitelist: a field added to MeetingView later is not passed through', () => {
    const source = { ...view(), internalNote: 'secret' } as MeetingView;
    assert.doesNotMatch(JSON.stringify(toApplicantMeetingView(source)), /internalNote|secret/);
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

  it('an applicant actor gets the applicant view, staff the full view', () => {
    assert.match(body, /actor\.applicant \? toApplicantMeetingView\(view\) : view/);
  });
});
