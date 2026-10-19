/** DASH-DN-UX-1 - recent activity names the real dossier of each audit event
 *  (never `#entityId`), and duration metrics read like /analytique. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActivityItems,
  businessActivityLabel,
  calendarDurationMetricValue,
  resolveActivityRequestId,
  type ActivityAuditRow,
  type ActivityLookup,
} from './dashboard.activity.js';

// Request 7 = DEM-A, request 8 = DEM-B. Phase 70 belongs to 7, phase 80 to 8.
const lookup: ActivityLookup = {
  requestReferenceById: new Map([
    [7, 'DEM-2026-10-05-OMAT-02'],
    [8, 'DEM-2026-10-06-OMAT-03'],
  ]),
  phaseRequestId: new Map([
    [70, 7],
    [80, 8],
  ]),
  paymentPhaseId: new Map([[500, 80]]),
  meetingPhaseId: new Map([[600, 70]]),
  certificateRequestId: new Map([[900, 8]]),
  circuitRequestId: new Map([[300, 7]]),
  formalDocumentPhaseId: new Map([[400, 80]]),
  evaluationDocumentId: new Map([[450, 400]]),
};

let nextId = 1;
const row = (action: string, entityId: number | null, extra: Partial<ActivityAuditRow> = {}): ActivityAuditRow => ({
  id: nextId++,
  action,
  entityId,
  requestId: null,
  details: null,
  actor: 'Agent DN',
  createdAt: new Date('2026-10-19T11:45:00.000Z'),
  ...extra,
});

describe('resolveActivityRequestId', () => {
  const cases: Array<[string, ActivityAuditRow, number | null]> = [
    ['request audit: entityId is the request', row('REQUEST_SUBMITTED', 7), 7],
    ['phase audit: phase -> request', row('PHASE_CLOSED', 80), 8],
    ['meeting audit: meeting -> phase -> request', row('MEETING_SCHEDULED', 600), 7],
    ['meeting status audit (prefix): meeting -> phase -> request', row('MEETING_HELD', 600), 7],
    ['payment audit: payment -> phase -> request', row('PAYMENT_VALIDATED', 500), 8],
    ['circuit audit: dg circuit document -> request', row('COURRIER_SIGNED_RETURNED', 300), 7],
    ['certificate audit: certificate -> request', row('CERTIFICATE_STATUS_CHANGED', 900), 8],
    ['formal document audit: document -> phase -> request', row('FORMAL_DOCUMENT_SUBMITTED', 400), 8],
    ['document evaluation audit: evaluation -> document -> phase -> request', row('DOCUMENT_VERDICT_SET', 450), 8],
    ['details.requestId wins over the entity id', row('PHASE_OPENED', 80, { details: { requestId: 7, phaseCode: 'M3' } }), 7],
    ['audit_logs.request_id wins over everything', row('PHASE_OPENED', 80, { requestId: 8, details: { requestId: 7 } }), 8],
    ['an unknown request id is not trusted (falls through to the entity)', row('PHASE_CLOSED', 70, { requestId: 999, details: { requestId: 998 } }), 7],
    ['a non-numeric details.requestId is ignored', row('USER_CREATED', 7, { details: { requestId: '7' } }), null],
    ['account event: the entity is not a dossier', row('USER_CREATED', 7), null],
    ['entity not loaded: unresolved', row('PAYMENT_VALIDATED', 12345), null],
    ['no entity id at all: unresolved', row('REQUEST_SUBMITTED', null), null],
  ];
  for (const [label, auditRow, expected] of cases) {
    it(label, () => assert.equal(resolveActivityRequestId(auditRow, lookup), expected));
  }
});

describe('buildActivityItems', () => {
  const href = (requestId: number) => `/demandes?id=${requestId}`;

  it('resolved event: requestId, DEM reference and dossier link; never the entity id', () => {
    const [item] = buildActivityItems([row('PAYMENT_VALIDATED', 500, { actor: 'Agent Finance' })], lookup, href);
    assert.equal(item.title, 'Paiement validé');
    assert.equal(item.requestId, 8);
    assert.equal(item.requestReference, 'DEM-2026-10-06-OMAT-03');
    assert.equal(item.href, '/demandes?id=8');
    assert.equal(item.actor, 'Agent Finance');
    assert.equal(item.createdAt, '2026-10-19T11:45:00.000Z');
  });

  it('unresolved event: no reference, no link, no « #id »', () => {
    const [item] = buildActivityItems([row('PAYMENT_VALIDATED', 17)], lookup, href);
    assert.equal(item.requestId, null);
    assert.equal(item.requestReference, null);
    assert.equal(item.href, undefined);
    assert.doesNotMatch(JSON.stringify(item), /#17/);
  });

  it('no link when the viewer may not open the dossier', () => {
    const [item] = buildActivityItems([row('REQUEST_SUBMITTED', 7)], lookup, () => undefined);
    assert.equal(item.requestReference, 'DEM-2026-10-05-OMAT-02');
    assert.equal(item.href, undefined);
  });

  it('skips technical events and returns up to 3 business events, newest first', () => {
    const rows = [
      row('LOGIN', null),
      row('PHASE_CLOSED', 70),
      row('APPLICANT_LOGIN', 1),
      row('AUTH_REFRESH', null),
      row('PAYMENT_VALIDATED', 500),
      row('LOGOUT', null),
      row('REQUEST_SUBMITTED', 8),
      row('MEETING_SCHEDULED', 600),
    ];
    const items = buildActivityItems(rows, lookup, href);
    assert.deepEqual(
      items.map((item) => item.title),
      ['Phase clôturée', 'Paiement validé', 'Demande mise à jour']
    );
  });
});

describe('labels and durations', () => {
  it('business labels carry their accents', () => {
    assert.equal(businessActivityLabel('CERTIFICATE_COLLECTED'), 'Certificat retiré');
    assert.equal(businessActivityLabel('DOCUMENT_VALIDATED'), 'Document accepté');
    assert.equal(businessActivityLabel('COURRIER_SENT_TO_SIGNATURE'), 'Circuit de signature mis à jour');
    assert.equal(businessActivityLabel('LOGIN'), null);
  });

  it('average_global_duration 4.9 -> « 4 j 22 h », raw value kept; null -> « - »', () => {
    assert.deepEqual(calendarDurationMetricValue(4.9), { value: '4 j 22 h', rawValue: 4.9, unit: 'calendar_days' });
    assert.deepEqual(calendarDurationMetricValue(null), { value: '-', rawValue: null, unit: 'calendar_days' });
  });
});
