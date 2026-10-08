/** K7 - on a closed dossier every workflow write is refused with
 *  DOSSIER_CLOSED and writes nothing (real PostgreSQL, skipped without
 *  DATABASE_URL). One closed dossier carries every entity an action can
 *  target (phases M3-M7, meetings, payments, evaluation, certificate, DG
 *  circuits); each action is called on it and the database is compared
 *  before / after. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

const WATCHED_TABLES = [
  'requests',
  'phases',
  'meetings',
  'payments',
  'certificates',
  'formal_request_documents',
  'document_evaluations',
  'dg_circuit_documents',
  'preliminary_evaluation_forms',
  'site_inspections',
  'audit_logs',
  'document_versions',
];

// Never reaches storage: every guard runs before the attachment is used.
const attachment = {
  assetId: 999_999,
  fileUrl: '/api/files/k7-never-used.pdf',
  mimeType: 'application/pdf',
  originalName: 'k7.pdf',
  sizeBytes: 4,
  uploadedByUserId: null,
  actor: { kind: 'staff', userId: 1 },
} as never;

describe('K7 closed dossier is read-only (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: Record<string, any>;
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const [phasesSvc, prelim, formal, deep, site, cert, meetings, courrier, requests, guard, dbModule] = await Promise.all([
      import('../phases/phases.service.js'),
      import('../preliminary-evaluation/preliminary-evaluation.service.js'),
      import('../formal-request/formal-request.service.js'),
      import('../deep-evaluation/deep-evaluation.service.js'),
      import('../site-inspection/site-inspection.service.js'),
      import('../certificates/certificates.service.js'),
      import('../meetings/meetings.service.js'),
      import('../courrier-tasks/courrier-tasks.service.js'),
      import('./requests.service.js'),
      import('./dossier-open.js'),
      import('../../shared/db/index.js'),
    ]);
    m = { phasesSvc, prelim, formal, deep, site, cert, meetings, courrier, requests, guard, db: dbModule.db };
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  async function snapshot() {
    const parts: string[] = [];
    for (const table of WATCHED_TABLES) {
      const row = await one(`SELECT count(*)::int AS c, md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM ${table} t`);
      parts.push(`${table}:${row.c}:${row.h}`);
    }
    return parts;
  }

  /** A dossier with every entity a workflow action can target. */
  async function dossierWithEverything(status: string) {
    const k = `${tag}${++n}`;
    const user = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent K7', $2) RETURNING id`, [`K7${k}`, `k7-${k}@t.local`])).id;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA K7 ${k}`])).id;
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`, [org, `p-${k}@t.local`])).id;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status, rejection_reason)
       VALUES ($1, $2, $3, 'issuance', $4, $5) RETURNING id`,
      [`DEM-K7-${k}`, applicant, org, status, status === 'rejected' ? 'Rejet test' : null]
    )).id;
    const phase: Record<string, number> = {};
    for (const code of ['M3', 'M4', 'M5', 'M6', 'M7']) {
      phase[code] = (await one(`INSERT INTO phases (request_id, phase_code) VALUES ($1, $2) RETURNING id`, [request, code])).id;
    }
    for (const code of ['M5', 'M6', 'M7']) {
      await pool.query(`INSERT INTO payments (phase_id, status, invoice_file_url, proof_file_url) VALUES ($1, 'pending_validation', 'i', 'p')`, [phase[code]]);
    }
    const meeting = (await one(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status) VALUES ($1, 'preliminary', $2, now() + interval '1 day', 'scheduled') RETURNING id`,
      [phase.M3, user]
    )).id;
    const visit = (await one(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status) VALUES ($1, 'site_visit', $2, now(), 'scheduled') RETURNING id`,
      [phase.M6, user]
    )).id;
    const doc = (await one(`INSERT INTO formal_request_documents (phase_id, slot) VALUES ($1, 'quality_manual') RETURNING id`, [phase.M4])).id;
    const evaluation = (await one(`INSERT INTO document_evaluations (formal_request_document_id) VALUES ($1) RETURNING id`, [doc])).id;
    const certificate = (await one(
      `INSERT INTO certificates (request_id, reference, certificate_type) VALUES ($1, $2, 'agreement') RETURNING id`,
      [request, `CERT-K7-${k}`]
    )).id;
    await pool.query(`INSERT INTO dg_circuit_documents (entity_type, request_id, status) VALUES ('intake_request', $1, 'submitted'), ('formal_request_letter', $1, 'submitted')`, [request]);
    return { user, applicant, request, phase, meeting, visit, evaluation, certificate };
  }

  function actions(d: Awaited<ReturnType<typeof dossierWithEverything>>): Array<[string, () => Promise<unknown>]> {
    const { phasesSvc, prelim, formal, deep, site, cert, meetings, courrier, requests } = m;
    const u = d.user;
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    return [
      ['M3 close phase', () => phasesSvc.closePhase(d.phase.M3, u, {})],
      ['M3 declaration made available', () => prelim.makeAvailable(d.phase.M3, u)],
      ['M3 declaration submitted (applicant)', () => prelim.submit(d.phase.M3, attachment)],
      ['M4 open', () => formal.openFormalPhase(d.request, u)],
      ['M4 letter submitted', () => formal.submitFormalLetter(d.request, attachment)],
      ['M4 letter signed', () => formal.markLetterSigned(d.request, u)],
      ['M4 letter pending review', () => formal.markLetterPendingReview(d.request, u)],
      ['M4 document submitted', () => formal.submitDocument(d.request, 'quality_manual', attachment)],
      ['M4 close phase', () => formal.closeFormalPhase(d.phase.M4, u, {})],
      ['M5 open', () => deep.openDeepEvaluationPhase(d.request, u)],
      ['M5 invoice', () => deep.uploadInvoice(d.phase.M5, attachment, u)],
      ['M5 proof (applicant)', () => deep.uploadPaymentProof(d.phase.M5, d.request, d.applicant, attachment)],
      ['M5 validate payment', () => deep.validatePayment(d.phase.M5, u)],
      ['M5 reject payment', () => deep.rejectPayment(d.phase.M5, u, 'request_new_proof', 'x')],
      ['M5 document verdict', () => deep.setVerdict(d.evaluation, 'validated', u)],
      ['M5 document resubmitted (applicant)', () => deep.resubmitDocument(d.evaluation, d.applicant, attachment)],
      ['M5 close phase', () => deep.closeDeepEvaluationPhase(d.phase.M5, u, {})],
      ['M6 open', () => site.openSiteInspectionPhase(d.request, u)],
      ['M6 invoice', () => site.uploadInvoice(d.phase.M6, attachment, u)],
      ['M6 proof (applicant)', () => site.uploadPaymentProof(d.phase.M6, d.request, d.applicant, attachment)],
      ['M6 validate payment', () => site.validatePayment(d.phase.M6, u)],
      ['M6 reject payment (dossier)', () => site.rejectPayment(d.phase.M6, u, 'reject_dossier', 'x')],
      ['M6 schedule site visit', () => site.scheduleSiteVisit({ phaseId: d.phase.M6, r3AgentId: u, scheduledAt: soon })],
      ['M6 site visit held', () => site.markAssignedSiteVisitHeld(d.visit, u)],
      ['M6 R3 opinion (the reported case)', () => site.submitInspectionVerdict(d.phase.M6, u, 'compliant', 'x')],
      ['M7 open (delivery)', () => cert.openDeliveryPhase(d.request, u)],
      ['M7 invoice', () => cert.uploadInvoice(d.phase.M7, attachment, u)],
      ['M7 proof (applicant)', () => cert.uploadPaymentProof(d.phase.M7, d.request, d.applicant, attachment)],
      ['M7 validate payment (creates the certificate)', () => cert.validatePayment(d.phase.M7, u)],
      ['M7 reject payment', () => cert.rejectPayment(d.phase.M7, u, 'request_new_proof', 'x')],
      ['M7 certificate fields', () => cert.updateCertificateFields(d.certificate, u, { approvalReferenceNumber: 'X' })],
      ['M7 certificate type', () => cert.overrideCertificateType(d.certificate, u, 'recognition')],
      ['M7 certificate generated', () => cert.generateCertificateDocument(d.certificate, u)],
      ['M7 certificate printed', () => cert.markPrinted(d.certificate, u)],
      ['M7 certificate signed', () => cert.markSigned(d.certificate, u, attachment)],
      ['M7 certificate archived', () => cert.markArchived(d.certificate, u)],
      ['M7 applicant notified', () => cert.notifyApplicant(d.certificate, u)],
      ['M7 certificate collected', () => cert.markCollected(d.certificate, u)],
      ['meeting scheduled', () => meetings.scheduleMeeting({ phaseId: d.phase.M3, meetingType: 'preliminary', dnAgentId: u, scheduledAt: soon })],
      ['meeting marked held', () => meetings.markMeetingStatus(d.meeting, u, 'held')],
      ['meeting rescheduled', () => meetings.rescheduleMeeting(d.meeting, u, soon)],
      ['meeting report uploaded', () => meetings.attachMeetingReport(d.meeting, u, attachment)],
      ['courrier sent to signature', () => courrier.confirmPrintedForSignature(`formal_request_letter:${d.request}`, u)],
      ['courrier signed copy returned', () => courrier.returnSigned(`formal_request_letter:${d.request}`, attachment, u)],
      ['M1 sent to signature', () => requests.sendToSignature(d.request, u)],
      ['M1 marked signed', () => requests.markSigned(d.request, u)],
      ['M1 pending review', () => requests.markPendingReview(d.request, u)],
      ['M1 signed copy returned', () => requests.returnSignedFromDg(d.request, attachment, u)],
      ['M1 circuit document replaced', () => requests.replaceCircuitDocument(d.request, attachment, u)],
      ['M1 cancelled (staff)', () => requests.cancelRequest(d.request, { userId: u })],
    ];
  }

  for (const status of ['rejected', 'cancelled', 'completed']) {
    it(`${status} dossier: every workflow action is refused with DOSSIER_CLOSED and writes nothing`, async () => {
      const d = await dossierWithEverything(status);
      const list = actions(d);
      const failures: string[] = [];
      for (const [label, call] of list) {
        const beforeState = await snapshot();
        let outcome = 'accepted';
        try {
          await call();
        } catch (error) {
          outcome = (error as Error).message;
        }
        const afterState = await snapshot();
        if (outcome !== 'DOSSIER_CLOSED') failures.push(`${label}: ${outcome.slice(0, 80)}`);
        const changed = WATCHED_TABLES.filter((_, i) => beforeState[i] !== afterState[i]);
        if (changed.length) failures.push(`${label}: wrote to ${changed.join(', ')}`);
      }
      assert.deepEqual(failures, [], `\n  ${failures.join('\n  ')}`);
      // Every write route of the workflow modules (cross-checked route by route,
      // see TASKS.md K7a); openPreliminaryPhase already requires 'pending_review'.
      assert.equal(list.length, 50);
    });
  }

  it('applicant-side: another applicant still gets NOT_FOUND, never learns the dossier is closed', async () => {
    const d = await dossierWithEverything('rejected');
    const stranger = d.applicant + 100_000;
    await assert.rejects(m.site.uploadPaymentProof(d.phase.M6, d.request, stranger, attachment), /PAYMENT_NOT_FOUND/);
    await assert.rejects(m.deep.resubmitDocument(d.evaluation, stranger, attachment), /EVALUATION_NOT_FOUND/);
    await assert.rejects(m.requests.cancelRequest(d.request, { applicantId: stranger }), /REQUEST_NOT_FOUND/);
  });

  it('an open dossier passes every guard', async () => {
    const d = await dossierWithEverything('in_progress');
    const { guard, db } = m;
    await guard.assertDossierOpen(db, d.request);
    await guard.assertPhaseDossierOpen(db, d.phase.M6);
    await guard.assertMeetingDossierOpen(db, d.visit);
    await guard.assertCertificateDossierOpen(db, d.certificate);
    await guard.assertEvaluationDossierOpen(db, d.evaluation);
  });

  it('a missing entity is left to the action (its own NOT_FOUND)', async () => {
    const { guard, db } = m;
    await guard.assertPhaseDossierOpen(db, 987_654_321);
    await assert.rejects(m.site.submitInspectionVerdict(987_654_321, 1, 'compliant', 'x'), /PHASE_NOT_FOUND/);
  });
});
