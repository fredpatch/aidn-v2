/** SESSION1-UX-1 - applicant actions against a real PostgreSQL (skipped
 *  without DATABASE_URL; needs a migrated, disposable database). Each action
 *  appears when eligible and disappears once the real write service resolves
 *  it; the row loader issues a constant number of queries. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import type { ApplicantAction } from '@aidn/shared';
import type { PreparedAttachment } from '../uploads/upload-attachment.js';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('SESSION1-UX-1 applicant actions (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let prelim: typeof import('../preliminary-evaluation/preliminary-evaluation.service.js');
  let formal: typeof import('../formal-request/formal-request.service.js');
  let deep: typeof import('../deep-evaluation/deep-evaluation.service.js');
  let negotiation: typeof import('../meetings/meeting-negotiation.service.js');
  let signedReport: typeof import('../meetings/meeting-signed-report.service.js');
  let service: typeof import('./applicant-actions.service.js');
  let rowsModule: typeof import('./applicant-actions.rows.js');
  let appPool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  let uploadsRoot: string;
  const tag = Date.now().toString(36);
  let n = 0;
  const createdFiles: string[] = [];

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    prelim = await import('../preliminary-evaluation/preliminary-evaluation.service.js');
    formal = await import('../formal-request/formal-request.service.js');
    deep = await import('../deep-evaluation/deep-evaluation.service.js');
    negotiation = await import('../meetings/meeting-negotiation.service.js');
    signedReport = await import('../meetings/meeting-signed-report.service.js');
    service = await import('./applicant-actions.service.js');
    rowsModule = await import('./applicant-actions.rows.js');
    const dbModule = await import('../../shared/db/index.js');
    appPool = dbModule.db.$client as pg.Pool;
    closeAppPool = () => dbModule.db.$client.end();
    uploadsRoot = (await import('../../shared/uploads-root.js')).UPLOADS_ROOT;
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
    for (const file of createdFiles) fs.rmSync(file, { force: true });
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  async function user() {
    const code = `UA${tag}${++n}`;
    return (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent DN', $2) RETURNING id`, [
      code,
      `${code}@test.local`,
    ])).id as number;
  }

  async function newApplicant() {
    const k = `${tag}-${++n}`;
    const org = (await one(
      `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
      [`OMA UA ${k}`]
    )).id as number;
    const applicant = (await one(
      `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`,
      [org, `ua-${k}@test.local`]
    )).id as number;
    return { org, applicant };
  }

  /** A dossier with the requested phases, all open. */
  async function dossier(
    owner?: { org: number; applicant: number },
    codes: string[] = ['M3', 'M5'],
    status = 'in_progress'
  ) {
    const who = owner ?? (await newApplicant());
    const k = `${tag}-${++n}`;
    // One active dossier per organisation: further dossiers of the same applicant get their own organisation.
    const org = owner
      ? ((await one(
          `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
          [`OMA UA extra ${k}`]
        )).id as number)
      : who.org;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status)
       VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-UA-${k}`, who.applicant, org, status]
    )).id as number;
    const phase: Record<string, number> = {};
    for (const code of codes) {
      phase[code] = (await one(`INSERT INTO phases (request_id, phase_code, status) VALUES ($1, $2, 'open') RETURNING id`, [request, code])).id;
    }
    return { applicant: who.applicant, org: who.org, request, phase };
  }

  async function asset(applicantId: number, onDisk = false): Promise<PreparedAttachment> {
    const storageKey = `ua-test/${tag}-${++n}.pdf`;
    if (onDisk) {
      const full = path.join(uploadsRoot, storageKey);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, '%PDF-1.4 test');
      createdFiles.push(full);
    }
    const { id } = await one(
      `INSERT INTO upload_assets (file_url, storage_key, original_name, mime_type, size_bytes,
                                  uploaded_by_applicant_id, uploaded_from_app)
       VALUES ('pending', $1, 'doc.pdf', 'application/pdf', 4, $2, 'portal') RETURNING id`,
      [storageKey, applicantId]
    );
    const fileUrl = `/api/files/${id}`;
    await pool.query(`UPDATE upload_assets SET file_url = $1 WHERE id = $2`, [fileUrl, id]);
    return { assetId: id, fileUrl, mimeType: 'application/pdf', originalName: 'doc.pdf', sizeBytes: 4, uploadedByUserId: null, actor: { kind: 'applicant', applicantId } };
  }

  async function slots(phaseId: number) {
    for (const slot of formal.ALL_SLOTS) {
      await pool.query(`INSERT INTO formal_request_documents (phase_id, slot) VALUES ($1, $2)`, [phaseId, slot]);
    }
  }

  async function meeting(phaseId: number, agent: number, over: { type?: string; status?: string; confirmation?: string; offsetHours?: number; cr?: boolean } = {}) {
    const { type = 'preliminary', status = 'scheduled', confirmation = 'awaiting_applicant', offsetHours = 240, cr = false } = over;
    return (await one(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status, confirmed_at, cr_document_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [phaseId, type, agent, new Date(Date.now() + offsetHours * 3_600_000), status, confirmation,
        confirmation === 'confirmed' ? new Date() : null, cr ? '/api/files/999999' : null]
    )).id as number;
  }

  const list = (applicantId: number) => service.listApplicantActions(applicantId);
  const keys = (actions: ApplicantAction[], requestId?: number) =>
    actions.filter((a) => requestId === undefined || a.requestId === requestId).map((a) => a.key).sort();

  it('declaration: listed when made available, gone after the real submit', async () => {
    const d = await dossier();
    const form = (await one(`INSERT INTO preliminary_evaluation_forms (phase_id) VALUES ($1) RETURNING id`, [d.phase.M3])).id as number;
    assert.deepEqual(keys(await list(d.applicant), d.request), []);
    await pool.query(`UPDATE preliminary_evaluation_forms SET made_available_at = now(), return_deadline = now() + interval '10 days' WHERE id = $1`, [form]);
    const [action] = await list(d.applicant);
    assert.equal(action.key, 'preliminary_declaration');
    assert.equal(action.anchor, 'declaration');
    assert.equal(action.urgent, false);
    await prelim.submit(d.phase.M3, await asset(d.applicant, true));
    assert.deepEqual(keys(await list(d.applicant), d.request), []);
  });

  it('M4 letter, pieces and count; letter submit and document submit resolve them', async () => {
    const d = await dossier(undefined, ['M4']);
    await slots(d.phase.M4);
    let actions = await list(d.applicant);
    assert.deepEqual(keys(actions), ['formal_letter', 'formal_missing_documents']);
    assert.equal(actions.find((a) => a.key === 'formal_missing_documents')!.count, 11);

    await formal.submitFormalLetter(d.request, await asset(d.applicant));
    actions = await list(d.applicant);
    assert.deepEqual(keys(actions), ['formal_missing_documents']); // letter in circuit + missing pieces

    for (const slot of formal.ALL_SLOTS) await formal.submitDocument(d.request, slot, await asset(d.applicant));
    assert.deepEqual(await list(d.applicant), []);
  });

  it('formal_missing_documents.count = 11 - completionRate; at 0 the closure gate no longer throws DOCUMENTS_INCOMPLETE', async () => {
    const d = await dossier(undefined, ['M4']);
    const agent = await user();
    await slots(d.phase.M4);
    await pool.query(
      `INSERT INTO dg_circuit_documents (entity_type, request_id, status, pending_review_at) VALUES ('formal_request_letter', $1, 'pending_review', now())`,
      [d.request]
    );
    await pool.query(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status, confirmed_at)
       VALUES ($1, 'formal', $2, $3, 'held', 'confirmed', now())`,
      [d.phase.M4, agent, new Date(Date.now() - 86_400_000)]
    );
    for (const slot of formal.ALL_SLOTS.slice(0, 4)) await formal.submitDocument(d.request, slot, await asset(d.applicant));
    const bundle = await formal.getBundleForRequest(d.request, 'applicant');
    const action = (await list(d.applicant)).find((a) => a.key === 'formal_missing_documents')!;
    assert.equal(action.count, 11 - bundle.completionRate);
    await assert.rejects(formal.closeFormalPhase(d.phase.M4, agent, {}), { message: 'DOCUMENTS_INCOMPLETE' });

    for (const slot of formal.ALL_SLOTS.slice(4)) await formal.submitDocument(d.request, slot, await asset(d.applicant));
    assert.equal((await list(d.applicant)).find((a) => a.key === 'formal_missing_documents'), undefined);
    await formal.closeFormalPhase(d.phase.M4, agent, {}); // does not throw
  });

  it('payment proof: listed awaiting_proof, gone after the proof upload; rejection variant; validated / pending → none', async () => {
    const d = await dossier();
    const payment = (await one(`INSERT INTO payments (phase_id) VALUES ($1) RETURNING id`, [d.phase.M5])).id as number;
    assert.deepEqual(await list(d.applicant), []); // awaiting_invoice
    await pool.query(`UPDATE payments SET invoice_file_url = '/api/files/999999', invoice_uploaded_at = now(), status = 'awaiting_proof' WHERE id = $1`, [payment]);
    let [action] = await list(d.applicant);
    assert.deepEqual([action.key, action.anchor, action.variant], ['payment_proof', 'paiement-M5', undefined]);

    await pool.query(`UPDATE payments SET rejection_reason = 'illisible' WHERE id = $1`, [payment]);
    [action] = await list(d.applicant);
    assert.equal(action.variant, 'after_rejection');

    await deep.uploadPaymentProof(d.phase.M5, d.request, d.applicant, await asset(d.applicant));
    assert.deepEqual(await list(d.applicant), []); // pending_validation, old rejection_reason kept (D11)

    await pool.query(`UPDATE payments SET status = 'validated', validated_at = now() WHERE id = $1`, [payment]);
    assert.deepEqual(await list(d.applicant), []);
  });

  it('corrections: listed with count, gone after the resubmit', async () => {
    const d = await dossier(undefined, ['M4', 'M5']);
    await slots(d.phase.M4);
    const [doc] = (await pool.query(`SELECT id FROM formal_request_documents WHERE phase_id = $1 ORDER BY id LIMIT 1`, [d.phase.M4])).rows;
    const evaluation = (await one(
      `INSERT INTO document_evaluations (formal_request_document_id, verdict, correction_deadline)
       VALUES ($1, 'needs_correction', now() + interval '30 days') RETURNING id`,
      [doc.id]
    )).id as number;
    const action = (await list(d.applicant)).find((a) => a.key === 'document_correction')!;
    assert.deepEqual([action.count, action.anchor, action.urgent], [1, 'corrections', false]);
    assert.notEqual(action.dueAt, null);
    await deep.resubmitDocument(evaluation, d.applicant, await asset(d.applicant));
    assert.equal((await list(d.applicant)).find((a) => a.key === 'document_correction'), undefined);
  });

  it('meeting confirmation: listed, gone after confirm; past unanswered meeting is urgent', async () => {
    const d = await dossier();
    const agent = await user();
    const m = await meeting(d.phase.M3, agent);
    let [action] = await list(d.applicant);
    assert.deepEqual([action.key, action.anchor, action.urgent], ['meeting_confirmation', `rendez-vous-${m}`, false]);
    await negotiation.confirmMeeting(m, d.applicant);
    assert.deepEqual(await list(d.applicant), []);

    const late = await dossier(d);
    await meeting(late.phase.M3, agent, { offsetHours: -48 });
    [action] = await list(d.applicant);
    assert.equal(action.requestId, late.request);
    assert.equal(action.urgent, true);
  });

  it('signed report: listed on a closed M3 phase with a held meeting and a DN CR, gone after the signed return', async () => {
    const d = await dossier();
    const agent = await user();
    await pool.query(`UPDATE phases SET status = 'closed' WHERE id = $1`, [d.phase.M3]);
    const m = await meeting(d.phase.M3, agent, { status: 'held', confirmation: 'confirmed', offsetHours: -24, cr: true });
    const [action] = await list(d.applicant);
    assert.deepEqual([action.key, action.anchor, action.dueAt], ['signed_meeting_report', `compte-rendu-${m}`, null]);
    await signedReport.submitSignedMeetingReport(m, d.applicant, await asset(d.applicant));
    assert.deepEqual(await list(d.applicant), []);
  });

  it('certificate: notified is listed, collected is not', async () => {
    const d = await dossier(undefined, ['M7']);
    const cert = (await one(
      `INSERT INTO certificates (request_id, reference, certificate_type, status, notified_at) VALUES ($1, $2, 'agreement', 'notified', now()) RETURNING id`,
      [d.request, `CERT-UA-${tag}-${++n}`]
    )).id as number;
    const [action] = await list(d.applicant);
    assert.deepEqual([action.key, action.anchor, action.priority], ['certificate_collection', 'retrait', 90]);
    await pool.query(`UPDATE certificates SET status = 'collected', collected_at = now() WHERE id = $1`, [cert]);
    assert.deepEqual(await list(d.applicant), []);
  });

  it('rejected, cancelled and completed dossiers carry no action', async () => {
    const owner = await newApplicant();
    const agent = await user();
    for (const status of ['rejected', 'cancelled', 'completed']) {
      const d = await dossier(owner, ['M3', 'M4', 'M5'], status);
      await meeting(d.phase.M3, agent);
      await slots(d.phase.M4);
      const payment = (await one(`INSERT INTO payments (phase_id) VALUES ($1) RETURNING id`, [d.phase.M5])).id as number;
      await pool.query(`UPDATE payments SET invoice_file_url = '/api/files/999999', status = 'awaiting_proof' WHERE id = $1`, [payment]);
    }
    assert.deepEqual(await list(owner.applicant), []);
    // ... but the cockpit scope still loads their rows.
    const cockpit = await rowsModule.loadApplicantActionRows({ applicantId: owner.applicant, includeClosedDossiers: true });
    assert.equal(cockpit.phases.length, 9);
    assert.equal((await rowsModule.loadApplicantActionRows({ applicantId: owner.applicant })).phases.length, 0);
  });

  it("another applicant's dossier never appears; ids are unique", async () => {
    const agent = await user();
    const a = await dossier();
    const b = await dossier();
    await meeting(a.phase.M3, agent);
    await meeting(b.phase.M3, agent, { offsetHours: 300 });
    const mine = await list(a.applicant);
    assert.ok(mine.length >= 1);
    assert.ok(mine.every((x) => x.requestId === a.request));
    const second = await dossier(a);
    await meeting(second.phase.M3, agent, { offsetHours: 400 });
    const both = await list(a.applicant);
    assert.equal(new Set(both.map((x) => x.id)).size, both.length);
  });

  it('issues exactly 8 queries whatever the number of dossiers', async () => {
    const agent = await user();
    const countQueries = async <T>(run: () => Promise<T>): Promise<number> => {
      const original = appPool.query.bind(appPool);
      let count = 0;
      (appPool as unknown as { query: unknown }).query = (...args: unknown[]) => {
        count += 1;
        return (original as (...a: unknown[]) => unknown)(...args);
      };
      try {
        await run();
      } finally {
        (appPool as unknown as { query: unknown }).query = original;
      }
      return count;
    };

    const single = await dossier();
    await meeting(single.phase.M3, agent);
    const owner = await newApplicant();
    for (let i = 0; i < 3; i += 1) {
      const d = await dossier(owner);
      await meeting(d.phase.M3, agent, { offsetHours: 240 + i });
    }

    assert.equal(await countQueries(() => rowsModule.loadApplicantActionRows({ applicantId: single.applicant })), 8);
    assert.equal(await countQueries(() => rowsModule.loadApplicantActionRows({ applicantId: owner.applicant })), 8);
    assert.equal(await countQueries(() => service.listApplicantActions(single.applicant)), 8);
    assert.equal(await countQueries(() => service.listApplicantActions(owner.applicant)), 8);
    assert.equal((await list(owner.applicant)).length, 3);
  });
});
