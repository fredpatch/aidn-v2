/** SESSION1-UX-1 - characterization of the applicant write guards against a
 *  real PostgreSQL (skipped without DATABASE_URL; needs a migrated, disposable
 *  database). Pins the error codes and their order so the services can reuse
 *  the shared predicates (@aidn/shared applicant-actions) without any change
 *  of behaviour. Seeds its own dossiers; upload assets are inserted directly
 *  (storage key outside staging/, so the after-commit relocation is a no-op). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import type { PreparedAttachment } from '../uploads/upload-attachment.js';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('SESSION1-UX-1 applicant write guards (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let prelim: typeof import('../preliminary-evaluation/preliminary-evaluation.service.js');
  let formal: typeof import('../formal-request/formal-request.service.js');
  let deep: typeof import('../deep-evaluation/deep-evaluation.service.js');
  let uploadsRoot: string;
  let closeAppPool: () => Promise<void>;
  const tag = Date.now().toString(36);
  let n = 0;
  const createdFiles: string[] = [];
  let generatedBefore: Set<string>;
  let generatedDir: string;

  before(async () => {
    // timestamp columns hold UTC: read them back as UTC (gotcha #25).
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      types: {
        getTypeParser: ((oid: number, format?: string) =>
          oid === 1114
            ? (value: string) => new Date(`${value.replace(' ', 'T')}Z`)
            : pg.types.getTypeParser(oid, format as 'text')) as typeof pg.types.getTypeParser,
      },
    });
    prelim = await import('../preliminary-evaluation/preliminary-evaluation.service.js');
    formal = await import('../formal-request/formal-request.service.js');
    deep = await import('../deep-evaluation/deep-evaluation.service.js');
    const dbModule = await import('../../shared/db/index.js');
    closeAppPool = () => dbModule.db.$client.end();
    uploadsRoot = (await import('../../shared/uploads-root.js')).UPLOADS_ROOT;
    generatedDir = path.join(uploadsRoot, 'generated', 'preliminary-evaluation-circuit');
    generatedBefore = new Set(fs.existsSync(generatedDir) ? fs.readdirSync(generatedDir) : []);
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
    for (const file of createdFiles) fs.rmSync(file, { force: true });
    if (fs.existsSync(generatedDir)) {
      for (const file of fs.readdirSync(generatedDir)) {
        if (!generatedBefore.has(file)) fs.rmSync(path.join(generatedDir, file), { force: true });
      }
    }
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
  const all = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

  async function user() {
    const code = `UX${tag}${++n}`;
    return (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent DN', $2) RETURNING id`, [
      code,
      `${code}@test.local`,
    ])).id as number;
  }

  /** A dossier with M3, M4 and M5 phases, all open. */
  async function dossier() {
    const k = `${tag}-${++n}`;
    const org = (await one(
      `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
      [`OMA UX1 ${k}`]
    )).id;
    const applicant = (await one(
      `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`,
      [org, `ux-${k}@test.local`]
    )).id as number;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status)
       VALUES ($1, $2, $3, 'issuance', 'in_progress') RETURNING id`,
      [`DEM-UX1-${k}`, applicant, org]
    )).id as number;
    const phase: Record<string, number> = {};
    for (const code of ['M3', 'M4', 'M5']) {
      phase[code] = (await one(`INSERT INTO phases (request_id, phase_code, status) VALUES ($1, $2, 'open') RETURNING id`, [request, code])).id;
    }
    return { applicant, request, phase };
  }

  /** A real upload_assets row owned by the applicant. With `onDisk`, a real
   *  file backs it (the M3 declaration copies the upload for the DG circuit). */
  async function asset(applicantId: number, onDisk = false): Promise<PreparedAttachment> {
    const storageKey = `ux1-test/${tag}-${++n}.pdf`;
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
    return {
      assetId: id,
      fileUrl,
      mimeType: 'application/pdf',
      originalName: 'doc.pdf',
      sizeBytes: 4,
      uploadedByUserId: null,
      actor: { kind: 'applicant', applicantId },
    };
  }

  /** The 11 M4 slots, all 'missing'. */
  async function slots(phaseId: number) {
    for (const slot of formal.ALL_SLOTS) {
      await pool.query(`INSERT INTO formal_request_documents (phase_id, slot) VALUES ($1, $2)`, [phaseId, slot]);
    }
  }
  const slotStatus = async (phaseId: number, slot: string) =>
    (await one(`SELECT * FROM formal_request_documents WHERE phase_id = $1 AND slot = $2`, [phaseId, slot])) as {
      id: number;
      status: string;
      file_url: string | null;
    };

  it('M3: not yet available → NOT_YET_AVAILABLE; submitted twice → DECLARATION_ALREADY_SUBMITTED', async () => {
    const d = await dossier();
    const form = (await one(`INSERT INTO preliminary_evaluation_forms (phase_id) VALUES ($1) RETURNING id`, [d.phase.M3])).id as number;

    await assert.rejects(prelim.submit(d.phase.M3, await asset(d.applicant, true)), { message: 'NOT_YET_AVAILABLE' });

    await pool.query(`UPDATE preliminary_evaluation_forms SET made_available_at = now() WHERE id = $1`, [form]);
    const first = await asset(d.applicant, true);
    const view = await prelim.submit(d.phase.M3, first);
    assert.equal(view.submittedFileUrl, first.fileUrl);

    await assert.rejects(prelim.submit(d.phase.M3, await asset(d.applicant, true)), { message: 'DECLARATION_ALREADY_SUBMITTED' });
    // replay of the very same upload: idempotent, not refused
    await prelim.submit(d.phase.M3, first);
  });

  it('M4: same slot twice → DOCUMENT_ALREADY_SUBMITTED; closed phase → PHASE_NOT_OPEN', async () => {
    const d = await dossier();
    await slots(d.phase.M4);
    const slot = formal.ALL_SLOTS[0];
    const first = await asset(d.applicant);
    await formal.submitDocument(d.request, slot, first);
    assert.equal((await slotStatus(d.phase.M4, slot)).status, 'submitted');

    await assert.rejects(formal.submitDocument(d.request, slot, await asset(d.applicant)), { message: 'DOCUMENT_ALREADY_SUBMITTED' });
    // replay of the same upload: idempotent, not refused
    await formal.submitDocument(d.request, slot, first);

    await pool.query(`UPDATE phases SET status = 'closed' WHERE id = $1`, [d.phase.M4]);
    await assert.rejects(formal.submitDocument(d.request, formal.ALL_SLOTS[1], await asset(d.applicant)), { message: 'PHASE_NOT_OPEN' });
    // PHASE_NOT_OPEN wins over an already-submitted slot
    await assert.rejects(formal.submitDocument(d.request, slot, await asset(d.applicant)), { message: 'PHASE_NOT_OPEN' });
  });

  it('M4: letter twice → LETTER_ALREADY_SUBMITTED; closed phase → PHASE_NOT_OPEN', async () => {
    const d = await dossier();
    const first = await asset(d.applicant);
    const view = await formal.submitFormalLetter(d.request, first);
    assert.equal(view.status, 'submitted');
    await assert.rejects(formal.submitFormalLetter(d.request, await asset(d.applicant)), { message: 'LETTER_ALREADY_SUBMITTED' });
    await formal.submitFormalLetter(d.request, first); // replay

    await pool.query(`UPDATE phases SET status = 'closed' WHERE id = $1`, [d.phase.M4]);
    await assert.rejects(formal.submitFormalLetter(d.request, await asset(d.applicant)), { message: 'PHASE_NOT_OPEN' });

    const other = await dossier();
    await pool.query(`UPDATE phases SET status = 'closed' WHERE id = $1`, [other.phase.M4]);
    await assert.rejects(formal.submitFormalLetter(other.request, await asset(other.applicant)), { message: 'PHASE_NOT_OPEN' });
  });

  it('M4 closure with one missing piece → DOCUMENTS_INCOMPLETE; all 11 submitted → passes gate 2', async () => {
    const d = await dossier();
    const agent = await user();
    await slots(d.phase.M4);
    await pool.query(
      `INSERT INTO dg_circuit_documents (entity_type, request_id, status, pending_review_at)
       VALUES ('formal_request_letter', $1, 'pending_review', now())`,
      [d.request]
    );
    await pool.query(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status, confirmed_at)
       VALUES ($1, 'formal', $2, $3, 'held', 'confirmed', now())`,
      [d.phase.M4, agent, new Date(Date.now() - 86_400_000)]
    );
    for (const slot of formal.ALL_SLOTS.slice(0, 10)) {
      await formal.submitDocument(d.request, slot, await asset(d.applicant));
    }
    await assert.rejects(formal.closeFormalPhase(d.phase.M4, agent, {}), { message: 'DOCUMENTS_INCOMPLETE' });

    await formal.submitDocument(d.request, formal.ALL_SLOTS[10], await asset(d.applicant));
    await formal.closeFormalPhase(d.phase.M4, agent, {});
    assert.equal((await one(`SELECT status FROM phases WHERE id = $1`, [d.phase.M4])).status, 'closed');
  });

  it('payment proof: no invoice → INVOICE_NOT_UPLOADED; validated → PAYMENT_ALREADY_VALIDATED; pending_validation → replaced (ok)', async () => {
    const d = await dossier();
    const payment = (await one(`INSERT INTO payments (phase_id) VALUES ($1) RETURNING id`, [d.phase.M5])).id as number;
    const upload = (attachment: PreparedAttachment) => deep.uploadPaymentProof(d.phase.M5, d.request, d.applicant, attachment);

    await assert.rejects(upload(await asset(d.applicant)), { message: 'INVOICE_NOT_UPLOADED' });

    await pool.query(
      `UPDATE payments SET invoice_file_url = '/api/files/999999', invoice_uploaded_at = now(), status = 'awaiting_proof' WHERE id = $1`,
      [payment]
    );
    const first = await upload(await asset(d.applicant));
    assert.equal(first.status, 'pending_validation');

    const second = await asset(d.applicant);
    const replaced = await upload(second);
    assert.equal(replaced.status, 'pending_validation');
    assert.equal(replaced.proofFileUrl, second.fileUrl);

    await pool.query(`UPDATE payments SET status = 'validated', validated_at = now() WHERE id = $1`, [payment]);
    await assert.rejects(upload(await asset(d.applicant)), { message: 'PAYMENT_ALREADY_VALIDATED' });
  });

  it('M5 resubmit on a validated document → RESUBMISSION_NOT_ALLOWED; on needs_correction → ok', async () => {
    const d = await dossier();
    await slots(d.phase.M4);
    const doc = await slotStatus(d.phase.M4, formal.ALL_SLOTS[0]);
    const evaluation = (await one(
      `INSERT INTO document_evaluations (formal_request_document_id, verdict) VALUES ($1, 'validated') RETURNING id`,
      [doc.id]
    )).id as number;

    await assert.rejects(deep.resubmitDocument(evaluation, d.applicant, await asset(d.applicant)), { message: 'RESUBMISSION_NOT_ALLOWED' });

    for (const verdict of ['needs_correction', 'rejected']) {
      await pool.query(`UPDATE document_evaluations SET verdict = $1 WHERE id = $2`, [verdict, evaluation]);
      const copy = await asset(d.applicant);
      const view = await deep.resubmitDocument(evaluation, d.applicant, copy);
      assert.equal(view.verdict, null, verdict);
      assert.equal(view.resubmittedFileUrl, copy.fileUrl, verdict);
    }

    // verdict reset by the resubmission: a further one is refused
    await assert.rejects(deep.resubmitDocument(evaluation, d.applicant, await asset(d.applicant)), { message: 'RESUBMISSION_NOT_ALLOWED' });
    assert.equal((await all(`SELECT 1 FROM document_evaluations WHERE id = $1`, [evaluation])).length, 1);
  });
});
