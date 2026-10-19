/** M3-OPEN-ATOMIC-1 - opening the preliminary phase is one atomic action:
 *  M3 row, request -> in_progress and the PHASE_OPENED audit commit together
 *  or not at all, and two concurrent openings leave exactly one M3. The gate
 *  (request AND Directeur DN circuit pending_review) and its error order are
 *  unchanged. Failures are injected with a temporary trigger scoped to the
 *  test dossier (no code patching). Real PostgreSQL, skipped without DATABASE_URL. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { pgConnectionConfig } from '../../shared/db/connection.js';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('M3-OPEN-ATOMIC-1 openPreliminaryPhase (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let phases: Record<string, any>;
  const tag = Date.now().toString(36);
  let n = 0;
  const created = { users: [] as number[], organisations: [] as number[], applicants: [] as number[], requests: [] as number[] };

  before(async () => {
    pool = new pg.Pool(pgConnectionConfig(DATABASE_URL));
    const [service, dbModule] = await Promise.all([import('./phases.service.js'), import('../../shared/db/index.js')]);
    phases = service;
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    const requests = created.requests;
    if (created.users.length) await pool.query(`DELETE FROM audit_logs WHERE user_id = ANY($1)`, [created.users]);
    if (requests.length) {
      await pool.query(`DELETE FROM phases WHERE request_id = ANY($1)`, [requests]);
      await pool.query(`DELETE FROM dg_circuit_documents WHERE request_id = ANY($1)`, [requests]);
      await pool.query(`DELETE FROM requests WHERE id = ANY($1)`, [requests]);
    }
    if (created.applicants.length) await pool.query(`DELETE FROM applicants WHERE id = ANY($1)`, [created.applicants]);
    if (created.organisations.length) await pool.query(`DELETE FROM organisations WHERE id = ANY($1)`, [created.organisations]);
    if (created.users.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
  /** The trigger's exception, as wrapped by drizzle in its cause. */
  const injected = (error: Error & { cause?: Error }) => /injected failure/.test(error.cause?.message ?? error.message);

  /** A dossier after the DG return (intake circuit pending_review) with an
   *  optional Directeur DN circuit; defaults to "both gates ready". */
  async function dossier(options: { requestStatus?: string; dnStatus?: string | null } = {}) {
    const k = `${tag}-${++n}`;
    const user = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent DN', $2) RETURNING id`, [`MO${k}`, `mo-${k}@test.local`])).id as number;
    created.users.push(user);
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA MO ${k}`])).id as number;
    created.organisations.push(org);
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`, [org, `mo-a-${k}@test.local`])).id as number;
    created.applicants.push(applicant);
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-MO-${k}`, applicant, org, options.requestStatus ?? 'pending_review']
    )).id as number;
    created.requests.push(request);
    await pool.query(
      `INSERT INTO dg_circuit_documents (entity_type, request_id, status, pending_review_at) VALUES ('intake_request', $1, 'pending_review', now())`,
      [request]
    );
    const dnStatus = options.dnStatus === undefined ? 'pending_review' : options.dnStatus;
    if (dnStatus) {
      await pool.query(`INSERT INTO dg_circuit_documents (entity_type, request_id, status) VALUES ('dn_director_annotation', $1, $2)`, [request, dnStatus]);
    }
    return { user, request };
  }

  const m3Rows = async (request: number) => (await pool.query(`SELECT id, opened_at FROM phases WHERE request_id = $1 AND phase_code = 'M3'`, [request])).rows;
  const requestRow = async (request: number) => one(`SELECT status, updated_at FROM requests WHERE id = $1`, [request]);
  const openedAudits = async (request: number) =>
    (await pool.query(`SELECT user_id, module, entity_id, details FROM audit_logs WHERE action = 'PHASE_OPENED' AND request_id = $1 ORDER BY id`, [request])).rows;

  /** Runs `body` with a BEFORE trigger on `table` that raises for `condition`. */
  async function withFailure(table: 'audit_logs' | 'requests', condition: string, body: () => Promise<void>) {
    const name = `mo_fail_${tag}_${++n}`;
    await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger AS $$ BEGIN
      IF ${condition} THEN RAISE EXCEPTION 'injected failure'; END IF;
      RETURN NEW; END $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT OR UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    try {
      await body();
    } finally {
      await pool.query(`DROP TRIGGER ${name} ON ${table}`);
      await pool.query(`DROP FUNCTION ${name}()`);
    }
  }

  describe('gate and error order (unchanged)', () => {
    it('missing request: REQUEST_NOT_FOUND', async () => {
      await assert.rejects(phases.openPreliminaryPhase(2_000_000_000, 1), /REQUEST_NOT_FOUND/);
    });

    it('existing M3: PHASE_ALREADY_OPEN, more specific than REQUEST_NOT_READY_FOR_PHASE', async () => {
      const d = await dossier({ requestStatus: 'in_progress' });
      await pool.query(`INSERT INTO phases (request_id, phase_code) VALUES ($1, 'M3')`, [d.request]);
      await assert.rejects(phases.openPreliminaryPhase(d.request, d.user), /PHASE_ALREADY_OPEN/);
      assert.equal((await m3Rows(d.request)).length, 1);
    });

    it('request not pending_review: REQUEST_NOT_READY_FOR_PHASE', async () => {
      const d = await dossier({ requestStatus: 'submitted' });
      await assert.rejects(phases.openPreliminaryPhase(d.request, d.user), /REQUEST_NOT_READY_FOR_PHASE/);
    });

    it('DG returned but no Directeur DN circuit: DN_ANNOTATION_REQUIRED', async () => {
      const d = await dossier({ dnStatus: null });
      await assert.rejects(phases.openPreliminaryPhase(d.request, d.user), /DN_ANNOTATION_REQUIRED/);
    });

    it('Directeur DN circuit not returned yet: DN_ANNOTATION_REQUIRED, nothing written', async () => {
      for (const dnStatus of ['submitted', 'in_signature_circuit']) {
        const d = await dossier({ dnStatus });
        await assert.rejects(phases.openPreliminaryPhase(d.request, d.user), /DN_ANNOTATION_REQUIRED/, dnStatus);
        assert.deepEqual(await m3Rows(d.request), []);
        assert.equal((await requestRow(d.request)).status, 'pending_review');
        assert.deepEqual(await openedAudits(d.request), []);
      }
    });

    it('both gates ready: one M3, request in_progress at the opening time, one PHASE_OPENED audit', async () => {
      const d = await dossier();
      const view = await phases.openPreliminaryPhase(d.request, d.user);
      const rows = await m3Rows(d.request);
      assert.equal(rows.length, 1);
      assert.equal(view.id, rows[0].id);
      assert.equal(view.phaseCode, 'M3');
      const req = await requestRow(d.request);
      assert.equal(req.status, 'in_progress');
      assert.equal(new Date(req.updated_at).getTime(), new Date(rows[0].opened_at).getTime(), 'one logical action time');
      assert.deepEqual(await openedAudits(d.request), [
        { user_id: d.user, module: 'M3', entity_id: rows[0].id, details: { requestId: d.request, phaseCode: 'M3' } },
      ]);
    });
  });

  describe('atomicity', () => {
    it('a failing PHASE_OPENED audit rolls back the M3 and the request status; a retry then succeeds', async () => {
      const d = await dossier();
      await withFailure('audit_logs', `NEW.action = 'PHASE_OPENED' AND NEW.request_id = ${d.request}`, async () => {
        await assert.rejects(phases.openPreliminaryPhase(d.request, d.user), injected);
      });
      assert.deepEqual(await m3Rows(d.request), []);
      assert.equal((await requestRow(d.request)).status, 'pending_review');
      assert.deepEqual(await openedAudits(d.request), []);
      // Nothing left half-done: the same call now succeeds.
      await phases.openPreliminaryPhase(d.request, d.user);
      assert.equal((await m3Rows(d.request)).length, 1);
      assert.equal((await requestRow(d.request)).status, 'in_progress');
      assert.equal((await openedAudits(d.request)).length, 1);
    });

    it('a failing request update rolls back the M3 already inserted; no audit', async () => {
      const d = await dossier();
      await withFailure('requests', `TG_OP = 'UPDATE' AND OLD.id = ${d.request}`, async () => {
        await assert.rejects(phases.openPreliminaryPhase(d.request, d.user), injected);
      });
      assert.deepEqual(await m3Rows(d.request), []);
      assert.equal((await requestRow(d.request)).status, 'pending_review');
      assert.deepEqual(await openedAudits(d.request), []);
    });

    it('two concurrent openings: exactly one M3 and one audit; the other gets PHASE_ALREADY_OPEN', async () => {
      for (let round = 0; round < 5; round += 1) {
        const d = await dossier();
        const results = await Promise.allSettled([
          phases.openPreliminaryPhase(d.request, d.user),
          phases.openPreliminaryPhase(d.request, d.user),
        ]);
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        assert.equal(fulfilled.length, 1, `round ${round}`);
        assert.equal(rejected.length, 1, `round ${round}`);
        assert.equal((rejected[0].reason as Error).message, 'PHASE_ALREADY_OPEN', `round ${round}`);
        assert.equal((await m3Rows(d.request)).length, 1);
        assert.equal((await requestRow(d.request)).status, 'in_progress');
        assert.equal((await openedAudits(d.request)).length, 1);
      }
    });
  });
});
