import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMeetingInvitationHtml,
  invitationFileName,
  invitationNumber,
  invitationVoidReason,
  type MeetingInvitationData,
} from './meeting-invitation.js';

// Run as a UTC server (like the staging container): a runner already on UTC+1
// would hide a missing timeZone option. Node applies a runtime TZ change.
process.env.TZ = 'UTC';

// Libreville is UTC+1 all year: 08:00Z = 09:00 local.
const data = (over: Partial<MeetingInvitationData> = {}): MeetingInvitationData => ({
  meetingId: 128,
  meetingType: 'preliminary',
  meetingStatus: 'scheduled',
  scheduledAt: new Date('2026-10-13T08:00:00Z'),
  location: null,
  requestReference: 'DEM-2026-10-05-OMAT-02',
  requestType: 'issuance',
  organisationName: 'Organisme Exemple Maintenance',
  contactName: 'Jeanne Exemple',
  ...over,
});
const html = (over: Partial<MeetingInvitationData> = {}) =>
  buildMeetingInvitationHtml(data(over), { logo: null, generatedAt: new Date('2026-10-07T08:15:00Z') });

describe('meeting invitation - content', () => {
  it('states the date and time in Libreville time, whatever the server TZ', () => {
    const out = html();
    assert.match(out, /<div class="m">mardi<\/div>/);
    assert.match(out, /<div class="d">13<\/div>/);
    assert.match(out, /octobre 2026/);
    assert.match(out, /09 h 00/);
    assert.doesNotMatch(out, /08 h 00/);
  });

  it('a late-evening UTC instant lands on the next Libreville day', () => {
    const out = html({ scheduledAt: new Date('2026-10-13T23:30:00Z') });
    assert.match(out, /<div class="d">14<\/div>/);
    assert.match(out, /00 h 30/);
  });

  it('accented French labels, subject built from meeting and request type', () => {
    const out = html({ meetingType: 'formal', requestType: 'renewal' });
    assert.match(out, /Réunion formelle relative à votre demande de renouvellement d&#039;agrément RAG 5\.3/);
    assert.match(out, /Direction de la Navigabilité/);
  });

  it('recipient: organisation, then the contact', () => {
    assert.match(html(), /<b>Organisme Exemple Maintenance<\/b> · à l'attention de Jeanne Exemple/);
  });

  it('Lieu only when the DN typed one (decision L: no default place)', () => {
    assert.doesNotMatch(html(), />Lieu</);
    assert.match(html({ meetingType: 'site_visit', location: 'Hangar 3, aéroport de Libreville' }), />Lieu<\/div><div class="v">Hangar 3, aéroport de Libreville</);
  });

  it('footer says the document is generated automatically and unsigned, with Libreville time', () => {
    assert.match(html(), /Document généré automatiquement par AIDN, sans signature, le 07\/10\/2026 à 09:15 \(heure de Libreville\)/);
  });

  it('names no ANAC staff member (decision 2026-10-07)', () => {
    for (const meetingType of ['preliminary', 'formal', 'site_visit']) {
      assert.doesNotMatch(html({ meetingType, location: 'Hangar 3' }), /Agent|Inspecteur/);
    }
  });

  it('numbers the invitation from the meeting id', () => {
    assert.equal(invitationNumber(128), 'RE-000128');
    assert.match(html(), /Invitation n° RE-000128/);
  });
});

describe('meeting invitation - security', () => {
  it('escapes every DN- or applicant-supplied value (no stored XSS)', () => {
    const out = html({
      location: '<script>alert(1)</script><img src=x onerror=alert(2)>',
      organisationName: 'A&B "Aéro"',
      contactName: "O'Neil</b>",
      requestReference: '<b>REF</b>',
    });
    assert.doesNotMatch(out, /<script>|<img src=x|<b>REF<\/b>|O'Neil<\/b>/);
    assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(out, /A&amp;B &quot;Aéro&quot;/);
  });

  it('file name is ASCII-safe for the Content-Disposition header', () => {
    assert.equal(invitationFileName(data()), 'invitation-DEM-2026-10-05-OMAT-02-2026-10-13.pdf');
    assert.equal(
      invitationFileName(data({ requestReference: 'X"; evil=1\r\n' })),
      'invitation-X___evil_1__-2026-10-13.pdf',
    );
    assert.equal(invitationFileName(data({ requestReference: null })), 'invitation-RE-000128-2026-10-13.pdf');
  });
});

describe('meeting invitation - validity', () => {
  it('a scheduled meeting has a valid invitation', () => {
    assert.equal(invitationVoidReason('scheduled'), null);
    assert.doesNotMatch(html(), /plus valable/);
  });

  for (const [status, reason] of [
    ['rescheduled', /reprogrammée/],
    ['held', /déjà eu lieu/],
    ['no_show', /absence constatée/],
    ['file_cancelled', /dossier a été annulé/],
  ] as const) {
    it(`${status}: the document is kept but marked void with its reason`, () => {
      const out = html({ meetingStatus: status });
      assert.match(out, /Cette invitation n'est plus valable/);
      assert.match(out, reason);
      assert.match(out, /class="is-void"/);
    });
  }

  it('an unknown future status is void too, never presented as valid', () => {
    assert.match(invitationVoidReason('something_new') ?? '', /n'est plus planifiée/);
  });
});
