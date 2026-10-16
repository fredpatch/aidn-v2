import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_ANCHORS, buildApplicantActions, orderApplicantActions } from './applicant-actions.policy.js';
import type { ApplicantActionRows } from './applicant-actions.rows.js';

const NOW = new Date('2026-10-15T08:00:00Z');
const H = 3_600_000;
const at = (hours: number) => new Date(NOW.getTime() + hours * H);

const rows = (over: Partial<ApplicantActionRows> = {}): ApplicantActionRows => ({
  phases: [], meetings: [], forms: [], formalDocuments: [], circuits: [], payments: [], evaluations: [], certificates: [],
  ...over,
});
const phase = (id: number, requestId: number, code: string, status = 'open', reference = 'DEM-A', requestStatus = 'in_progress') => ({
  id, requestId, requestReference: reference, requestStatus, phaseCode: code, status,
});
const meeting = (over: Partial<ApplicantActionRows['meetings'][number]> = {}) => ({
  id: 12, phaseId: 3, meetingType: 'preliminary', status: 'scheduled', confirmationStatus: 'awaiting_applicant',
  scheduledAt: at(240), crDocumentUrl: null as string | null, signedCrDocumentUrl: null as string | null, ...over,
});
const payment = (over: Partial<ApplicantActionRows['payments'][number]> = {}) => ({
  id: 7, phaseId: 5, status: 'awaiting_proof', invoiceFileUrl: '/api/files/1' as string | null, rejectionReason: null as string | null, ...over,
});
const evaluation = (over: Partial<ApplicantActionRows['evaluations'][number]> = {}) => ({
  id: 1, requestId: 1, formalRequestDocumentId: 1, verdict: 'needs_correction' as string | null, correctionDeadline: null as Date | null, ...over,
});
const docs = (phaseId: number, missing: number, total = 11) =>
  Array.from({ length: total }, (_, i) => ({ id: phaseId * 100 + i, phaseId, status: i < missing ? 'missing' : 'submitted' }));

describe('buildApplicantActions', () => {
  it('meeting awaiting the applicant: one action, anchor rendez-vous-<id>, dueAt = scheduledAt', () => {
    const out = buildApplicantActions(rows({ phases: [phase(3, 1, 'M3')], meetings: [meeting()] }), NOW);
    assert.deepEqual(out, [{
      id: 'meeting_confirmation:1:12', key: 'meeting_confirmation', requestId: 1, requestReference: 'DEM-A',
      phaseCode: 'M3', priority: 10, urgent: false, anchor: 'rendez-vous-12', dueAt: at(240).toISOString(),
    }]);
  });

  it('past unanswered meeting stays listed and is urgent', () => {
    const out = buildApplicantActions(rows({ phases: [phase(3, 1, 'M3')], meetings: [meeting({ scheduledAt: at(-48) })] }), NOW);
    assert.equal(out.length, 1);
    assert.equal(out[0].key, 'meeting_confirmation');
    assert.equal(out[0].urgent, true);
  });

  it('site visit (M6) never yields a confirmation or a signed report', () => {
    const m = meeting({ meetingType: 'site_visit', phaseId: 6, confirmationStatus: 'not_required', status: 'held', crDocumentUrl: '/x' });
    const m2 = meeting({ id: 13, meetingType: 'site_visit', phaseId: 6, confirmationStatus: 'awaiting_applicant' });
    assert.deepEqual(buildApplicantActions(rows({ phases: [phase(6, 1, 'M6')], meetings: [m, m2] }), NOW), []);
  });

  it('signed report: listed on a closed M3 phase, anchor compte-rendu-<id>, no dueAt', () => {
    const m = meeting({ status: 'held', confirmationStatus: 'confirmed', crDocumentUrl: '/api/files/9' });
    const out = buildApplicantActions(rows({ phases: [phase(3, 1, 'M3', 'closed')], meetings: [m] }), NOW);
    assert.deepEqual(out.map((a) => [a.key, a.id, a.anchor, a.dueAt, a.urgent, a.priority]),
      [['signed_meeting_report', 'signed_meeting_report:1:12', 'compte-rendu-12', null, false, 80]]);
  });

  it('declaration: dueAt = returnDeadline; urgent inside 72 h; not urgent at 73 h', () => {
    const build = (h: number) => buildApplicantActions(rows({
      phases: [phase(3, 1, 'M3')],
      forms: [{ id: 4, phaseId: 3, madeAvailableAt: at(-1), submittedFileUrl: null, returnDeadline: at(h) }],
    }), NOW);
    const a = build(72);
    assert.deepEqual([a[0].key, a[0].id, a[0].anchor, a[0].dueAt, a[0].urgent],
      ['preliminary_declaration', 'preliminary_declaration:1:4', 'declaration', at(72).toISOString(), true]);
    assert.equal(build(73)[0].urgent, false);
  });

  it('letter only before the circuit; pieces from M4 opening, count = missing rows', () => {
    const p = phase(4, 1, 'M4');
    const a = buildApplicantActions(rows({ phases: [p], formalDocuments: docs(4, 11) }), NOW);
    assert.deepEqual(a.map((x) => [x.key, x.count, x.anchor]), [
      ['formal_letter', undefined, 'lettre'], ['formal_missing_documents', 11, 'pieces'],
    ]);
    const b = buildApplicantActions(rows({
      phases: [p], formalDocuments: docs(4, 10),
      circuits: [{ id: 1, requestId: 1, entityType: 'formal_request_letter', status: 'submitted' }],
    }), NOW);
    assert.deepEqual(b.map((x) => [x.key, x.count]), [['formal_missing_documents', 10]]);
  });

  it('payment: awaiting_proof → action; after a rejection → variant; pending_validation / validated → none', () => {
    const p = phase(5, 1, 'M5');
    const one = (pay: ReturnType<typeof payment>) => buildApplicantActions(rows({ phases: [p], payments: [pay] }), NOW);
    const plain = one(payment());
    assert.deepEqual([plain[0].key, plain[0].id, plain[0].anchor, plain[0].variant], ['payment_proof', 'payment_proof:1:7', 'paiement-M5', undefined]);
    assert.equal(one(payment({ rejectionReason: 'illisible' }))[0].variant, 'after_rejection');
    assert.deepEqual(one(payment({ status: 'pending_validation' })), []);
    assert.deepEqual(one(payment({ status: 'validated', rejectionReason: 'old' })), []);
  });

  it('corrections: count and earliest correctionDeadline; M5 closed → none', () => {
    const evals = [
      evaluation({ id: 1, correctionDeadline: at(200) }),
      evaluation({ id: 2, verdict: 'rejected', correctionDeadline: at(100) }),
      evaluation({ id: 3, verdict: 'validated', correctionDeadline: at(10) }),
    ];
    const a = buildApplicantActions(rows({ phases: [phase(5, 1, 'M5')], evaluations: evals }), NOW);
    assert.deepEqual([a[0].key, a[0].count, a[0].dueAt, a[0].anchor, a[0].id],
      ['document_correction', 2, at(100).toISOString(), 'corrections', 'document_correction:1:5']);
    assert.deepEqual(buildApplicantActions(rows({ phases: [phase(5, 1, 'M5', 'closed')], evaluations: evals }), NOW), []);
  });

  it('certificate notified → certificate_collection, priority 90', () => {
    const a = buildApplicantActions(rows({
      phases: [phase(7, 1, 'M7')], certificates: [{ id: 2, requestId: 1, status: 'notified' }],
    }), NOW);
    assert.deepEqual(a.map((x) => [x.key, x.priority, x.phaseCode, x.anchor]), [['certificate_collection', 90, 'M7', 'retrait']]);
  });

  it('rows of a closed dossier yield no action at all', () => {
    for (const status of ['rejected', 'completed', 'cancelled']) {
      const out = buildApplicantActions(rows({
        phases: [phase(3, 1, 'M3', 'open', 'DEM-A', status), phase(4, 1, 'M4', 'open', 'DEM-A', status), phase(5, 1, 'M5', 'open', 'DEM-A', status)],
        meetings: [meeting()],
        payments: [payment()],
        formalDocuments: docs(4, 3),
        evaluations: [evaluation()],
      }), NOW);
      assert.deepEqual(out, [], status);
    }
  });

  it('ordering: urgent first by dueAt, then base priority, then reference, then id', () => {
    const phs = [phase(3, 1, 'M3'), phase(5, 1, 'M5'), phase(15, 2, 'M5', 'open', 'DEM-B'), phase(25, 3, 'M5', 'open', 'DEM-A')];
    const out = buildApplicantActions(rows({
      phases: phs,
      meetings: [meeting({ scheduledAt: at(240) })],
      payments: [payment({ id: 8, phaseId: 15 }), payment({ id: 9, phaseId: 25 })],
      evaluations: [evaluation({ requestId: 1, correctionDeadline: at(24) })],
    }), NOW);
    assert.deepEqual(out.map((a) => a.id), [
      'document_correction:1:5', // urgent
      'meeting_confirmation:1:12', // prio 10
      'payment_proof:3:9', // prio 20, DEM-A
      'payment_proof:2:8', // DEM-B
    ]);
    const mix = buildApplicantActions(rows({
      phases: [phase(3, 1, 'M3'), phase(5, 1, 'M5')],
      meetings: [meeting({ scheduledAt: at(240) })],
      evaluations: [evaluation({ correctionDeadline: at(21 * 24) })],
    }), NOW);
    assert.deepEqual(mix.map((a) => a.key), ['meeting_confirmation', 'document_correction']);
  });

  it('urgent payment-less correction precedes a no-dueAt payment proof', () => {
    const out = buildApplicantActions(rows({
      phases: [phase(5, 1, 'M5'), phase(15, 2, 'M5', 'open', 'DEM-0')],
      payments: [payment({ id: 8, phaseId: 15 })],
      evaluations: [evaluation({ requestId: 1, correctionDeadline: at(24) })],
    }), NOW);
    assert.deepEqual(out.map((a) => a.key), ['document_correction', 'payment_proof']);
  });

  it('ids are unique and two meetings of one dossier give two rows', () => {
    const out = buildApplicantActions(rows({
      phases: [phase(3, 1, 'M3'), phase(4, 1, 'M4')],
      meetings: [meeting({ id: 12 }), meeting({ id: 13, phaseId: 4, meetingType: 'formal' })],
    }), NOW);
    assert.equal(out.filter((a) => a.key === 'meeting_confirmation').length, 2);
    assert.equal(new Set(out.map((a) => a.id)).size, out.length);
  });
});

describe('orderApplicantActions / anchors', () => {
  it('returns a new array', () => {
    const input = [] as ReturnType<typeof buildApplicantActions>;
    assert.notEqual(orderApplicantActions(input), input);
  });
  const mk = (id: string, over: Partial<ReturnType<typeof buildApplicantActions>[number]> = {}) => ({
    id, key: 'payment_proof' as const, requestId: 1, requestReference: 'DEM-A', phaseCode: 'M5' as const,
    priority: 20, urgent: false, anchor: 'x', dueAt: null as string | null, ...over,
  });
  it('urgent actions with the same dueAt are ordered by base priority', () => {
    const due = at(10).toISOString();
    const out = orderApplicantActions([
      mk('a', { urgent: true, dueAt: due, priority: 30 }),
      mk('b', { urgent: true, dueAt: due, priority: 10 }),
    ]);
    assert.deepEqual(out.map((x) => x.id), ['b', 'a']);
  });
  it('non-urgent, equal priority: dated before undated; undated fall back to reference then id', () => {
    const out = orderApplicantActions([
      mk('u2', { requestReference: 'DEM-A' }),
      mk('u0', { requestReference: 'DEM-B' }),
      mk('z-dated', { requestReference: 'DEM-Z', dueAt: at(500).toISOString() }),
      mk('u1', { requestReference: 'DEM-A' }),
    ]);
    assert.deepEqual(out.map((x) => x.id), ['z-dated', 'u1', 'u2', 'u0']);
  });
  it('anchors', () => {
    assert.equal(ACTION_ANCHORS.meeting(12), 'rendez-vous-12');
    assert.equal(ACTION_ANCHORS.signedReport(12), 'compte-rendu-12');
    assert.equal(ACTION_ANCHORS.payment('M5'), 'paiement-M5');
  });
});
