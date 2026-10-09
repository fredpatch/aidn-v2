/** C2c - GET /courrier-tasks: the actions follow the phase guard of the
 *  mutations (M3 / M4 must be open), and the signature delay follows the
 *  Circuit DG alert (working days, `dg_circuit_alert_days`). Real PostgreSQL,
 *  skipped without DATABASE_URL. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('C2c courrier tasks: phase guard and signature delay (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: Record<string, any>;
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const [courrier, dbModule] = await Promise.all([
      import('./courrier-tasks.service.js'),
      import('../../shared/db/index.js'),
    ]);
    service = courrier;
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) =>
    (await pool.query(sql, params)).rows[0];

  /** An open dossier with a formal letter in the circuit; `m4` = the M4 phase state. */
  async function letter(m4: 'open' | 'closed' | 'none', circuit: string, sentDaysAgo?: number) {
    const k = `${tag}${++n}`;
    const org = (
      await one(
        `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
        [`OMA C2c ${k}`]
      )
    ).id;
    const applicant = (
      await one(
        `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`,
        [org, `c2c-${k}@t.local`]
      )
    ).id;
    const request = (
      await one(
        `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', 'in_progress') RETURNING id`,
        [`DEM-C2C-${k}`, applicant, org]
      )
    ).id;
    if (m4 !== 'none') {
      await pool.query(
        `INSERT INTO phases (request_id, phase_code, status) VALUES ($1, 'M4', $2)`,
        [request, m4]
      );
    }
    await pool.query(
      `INSERT INTO dg_circuit_documents (entity_type, request_id, status, signature_sent_at)
       VALUES ('formal_request_letter', $1, $2, CASE WHEN $3::int IS NULL THEN NULL ELSE now() - ($3::int * interval '1 day') END)`,
      [request, circuit, sentDaysAgo ?? null]
    );
    return request as number;
  }

  async function taskOf(request: number) {
    const list = await service.listCourrierTasks({});
    const task = list.items.find((item: { requestId: number }) => item.requestId === request);
    assert.ok(task, 'task listed');
    return { task, list };
  }

  it('open M4 phase: actions offered, no blocked reason', async () => {
    const { task } = await taskOf(await letter('open', 'submitted'));
    assert.deepEqual(task.availableActions, ['print', 'confirm_signature_circuit']);
    assert.equal(task.actionBlockedReason, null);
  });

  it('M4 phase closed or missing: no action, reason « phase_not_open » (the mutation would refuse)', async () => {
    for (const m4 of ['closed', 'none'] as const) {
      const request = await letter(m4, 'submitted');
      const { task } = await taskOf(request);
      assert.deepEqual(task.availableActions, []);
      assert.equal(task.actionBlockedReason, 'phase_not_open');
      await assert.rejects(
        service.confirmPrintedForSignature(task.id, 1),
        /PHASE_NOT_(OPEN|FOUND)/
      );
    }
  });

  it('a returned courrier is never flagged blocked (nothing pending)', async () => {
    const { task } = await taskOf(await letter('closed', 'pending_review'));
    assert.deepEqual(task.availableActions, []);
    assert.equal(task.actionBlockedReason, null);
  });

  it('signature delay in working days; late beyond the Circuit DG threshold', async () => {
    const { task: old, list } = await taskOf(await letter('open', 'in_signature_circuit', 30));
    assert.equal(typeof list.signatureAlertDays, 'number');
    assert.ok(old.signatureWorkingDays > list.signatureAlertDays);
    assert.ok(old.signatureWorkingDays < 30, 'weekends are not counted');
    assert.equal(old.signatureLate, true);

    const { task: fresh } = await taskOf(await letter('open', 'in_signature_circuit', 0));
    assert.equal(fresh.signatureWorkingDays, 0);
    assert.equal(fresh.signatureLate, false);

    const { task: toPrint } = await taskOf(await letter('open', 'submitted'));
    assert.equal(toPrint.signatureWorkingDays, null);
    assert.equal(toPrint.signatureLate, false);
  });

  it('C2d: a courrier blocked by its phase leaves the action bucket and its count, stays in the full list', async () => {
    const blocked = await letter('closed', 'submitted');
    const open = await letter('open', 'submitted');
    const toPrint = await service.listCourrierTasks({ bucket: 'to_signature' });
    const ids = toPrint.items.map((item: { requestId: number }) => item.requestId);
    assert.ok(ids.includes(open) && !ids.includes(blocked));
    const all = await service.listCourrierTasks({});
    assert.ok(all.items.some((item: { requestId: number }) => item.requestId === blocked));
    assert.equal(all.counts.toSignature, toPrint.items.length);
  });

  it('C2d: one task carries its request, organisation, applicant and current document (batch load)', async () => {
    const request = await letter('open', 'submitted');
    const circuit = (
      await one(`SELECT id FROM dg_circuit_documents WHERE request_id = $1`, [request])
    ).id;
    await pool.query(
      `INSERT INTO document_versions (owner_type, owner_id, file_url, mime_type, is_current)
       VALUES ('dg_circuit_document', $1, '/api/files/c2d.pdf', 'application/pdf', true)`,
      [circuit]
    );
    const { task } = await taskOf(request);
    assert.match(task.requestReference, /^DEM-C2C-/);
    assert.match(task.organisationName, /^OMA C2c /);
    assert.equal(task.applicantName, 'P');
    assert.equal(task.fileUrl, '/api/files/c2d.pdf');
  });
});
