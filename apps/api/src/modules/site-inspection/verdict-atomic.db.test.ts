/** BUG-M6-VERDICT-ATOMIC-1 - the CI opinion is one atomic M6 action:
 *  opinion row, M6 closure and both audit rows commit together or not at all,
 *  and two concurrent submissions leave exactly one opinion. Failures are
 *  injected with a temporary trigger scoped to the test phase (no code
 *  patching). Real PostgreSQL, skipped without DATABASE_URL. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { pgConnectionConfig } from '../../shared/db/connection.js';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('BUG-M6-VERDICT-ATOMIC-1 submitInspectionVerdict (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let site: Record<string, any>;
  const tag = Date.now().toString(36);
  let n = 0;
  const created = { users: [] as number[], organisations: [] as number[], applicants: [] as number[], requests: [] as number[] };

  before(async () => {
    pool = new pg.Pool(pgConnectionConfig(DATABASE_URL));
    const [service, dbModule] = await Promise.all([import('./site-inspection.service.js'), import('../../shared/db/index.js')]);
    site = service;
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    const requests = created.requests;
    if (requests.length) {
      const phaseIds = `SELECT id FROM phases WHERE request_id = ANY($1)`;
      await pool.query(`DELETE FROM site_inspections WHERE phase_id IN (${phaseIds})`, [requests]);
      await pool.query(`DELETE FROM meetings WHERE phase_id IN (${phaseIds})`, [requests]);
      await pool.query(`DELETE FROM payments WHERE phase_id IN (${phaseIds})`, [requests]);
      await pool.query(`DELETE FROM phases WHERE request_id = ANY($1)`, [requests]);
      await pool.query(`DELETE FROM requests WHERE id = ANY($1)`, [requests]);
    }
    if (created.applicants.length) await pool.query(`DELETE FROM applicants WHERE id = ANY($1)`, [created.applicants]);
    if (created.organisations.length) await pool.query(`DELETE FROM organisations WHERE id = ANY($1)`, [created.organisations]);
    if (created.users.length) {
      await pool.query(`DELETE FROM audit_logs WHERE user_id = ANY($1)`, [created.users]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  /** An open M6 with a validated payment and a held visit assigned to a fresh CI agent. */
  async function readyM6(options: { dossierStatus?: string; phaseStatus?: string } = {}) {
    const k = `${tag}-${++n}`;
    const agent = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent CI', $2) RETURNING id`, [`VA${k}`, `va-${k}@test.local`])).id as number;
    created.users.push(agent);
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA VA ${k}`])).id as number;
    created.organisations.push(org);
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`, [org, `va-a-${k}@test.local`])).id as number;
    created.applicants.push(applicant);
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-VA-${k}`, applicant, org, options.dossierStatus ?? 'in_progress']
    )).id as number;
    created.requests.push(request);
    const phase = (await one(`INSERT INTO phases (request_id, phase_code, status) VALUES ($1, 'M6', $2) RETURNING id`, [request, options.phaseStatus ?? 'open'])).id as number;
    await pool.query(`INSERT INTO payments (phase_id, status) VALUES ($1, 'validated')`, [phase]);
    const visit = (await one(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status)
       VALUES ($1, 'site_visit', $2, now() - interval '1 day', 'held', 'not_required') RETURNING id`,
      [phase, agent]
    )).id as number;
    return { agent, request, phase, visit };
  }

  const inspections = async (phase: number) => (await pool.query(`SELECT * FROM site_inspections WHERE phase_id = $1`, [phase])).rows;
  const phaseRow = async (phase: number) => one(`SELECT status, closed_at FROM phases WHERE id = $1`, [phase]);
  const auditsOf = async (agent: number) =>
    (await pool.query(`SELECT action, module, entity_id, details FROM audit_logs WHERE user_id = $1 ORDER BY id`, [agent])).rows;

  /** Runs `body` with a BEFORE trigger on `table` that raises for `condition`. */
  async function withFailure(table: 'audit_logs' | 'phases', condition: string, body: () => Promise<void>) {
    const name = `va_fail_${tag}_${++n}`;
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

  it('success: one opinion, M6 closed at the opinion time, one pair of audits (actor, M6, verdict)', async () => {
    const m6 = await readyM6();
    const view = await site.submitInspectionVerdict(m6.phase, m6.agent, 'compliant_with_reserves', 'Réserves mineures');
    const rows = await inspections(m6.phase);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].r3_agent_id, m6.agent);
    assert.equal(rows[0].meeting_id, m6.visit);
    assert.equal(view.verdict, 'compliant_with_reserves');
    const phase = await phaseRow(m6.phase);
    assert.equal(phase.status, 'closed');
    assert.ok(phase.closed_at);
    assert.equal(new Date(rows[0].submitted_at).getTime(), new Date(phase.closed_at).getTime(), 'one logical action time');
    assert.deepEqual(await auditsOf(m6.agent), [
      { action: 'INSPECTION_VERDICT_SUBMITTED', module: 'M6', entity_id: rows[0].id, details: { verdict: 'compliant_with_reserves' } },
      { action: 'PHASE_CLOSED', module: 'M6', entity_id: m6.phase, details: { trigger: 'auto_on_verdict' } },
    ]);
  });

  it('a failing last audit (PHASE_CLOSED) rolls back the opinion, the closure and the first audit', async () => {
    const m6 = await readyM6();
    await withFailure('audit_logs', `NEW.action = 'PHASE_CLOSED' AND NEW.entity_id = ${m6.phase}`, async () => {
      await assert.rejects(site.submitInspectionVerdict(m6.phase, m6.agent, 'compliant', 'ok'));
    });
    assert.deepEqual(await inspections(m6.phase), []);
    assert.deepEqual(await phaseRow(m6.phase), { status: 'open', closed_at: null });
    assert.deepEqual(await auditsOf(m6.agent), []);
    // Nothing left half-done: the same submission now succeeds.
    await site.submitInspectionVerdict(m6.phase, m6.agent, 'compliant', 'ok');
    assert.equal((await inspections(m6.phase)).length, 1);
  });

  it('a failing M6 closure rolls back the opinion already inserted; no audit', async () => {
    const m6 = await readyM6();
    await withFailure('phases', `TG_OP = 'UPDATE' AND OLD.id = ${m6.phase}`, async () => {
      await assert.rejects(site.submitInspectionVerdict(m6.phase, m6.agent, 'non_compliant', 'ko'));
    });
    assert.deepEqual(await inspections(m6.phase), []);
    assert.deepEqual(await phaseRow(m6.phase), { status: 'open', closed_at: null });
    assert.deepEqual(await auditsOf(m6.agent), []);
  });

  it('two concurrent submissions: exactly one opinion, one closure, one pair of audits; the other gets VERDICT_ALREADY_SUBMITTED', async () => {
    for (let round = 0; round < 5; round += 1) {
      const m6 = await readyM6();
      const results = await Promise.allSettled([
        site.submitInspectionVerdict(m6.phase, m6.agent, 'compliant', 'premier'),
        site.submitInspectionVerdict(m6.phase, m6.agent, 'non_compliant', 'second'),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      assert.equal(fulfilled.length, 1, `round ${round}`);
      assert.equal(rejected.length, 1, `round ${round}`);
      assert.equal((rejected[0].reason as Error).message, 'VERDICT_ALREADY_SUBMITTED', `round ${round}`);
      assert.equal((await inspections(m6.phase)).length, 1);
      assert.equal((await phaseRow(m6.phase)).status, 'closed');
      const actions = (await auditsOf(m6.agent)).map((a) => a.action);
      assert.deepEqual(actions, ['INSPECTION_VERDICT_SUBMITTED', 'PHASE_CLOSED']);
    }
  });

  it('existing refusals are kept: a second submission, an M6 closed without opinion, a closed dossier', async () => {
    const m6 = await readyM6();
    await site.submitInspectionVerdict(m6.phase, m6.agent, 'compliant', 'ok');
    await assert.rejects(site.submitInspectionVerdict(m6.phase, m6.agent, 'compliant', 'ok'), /VERDICT_ALREADY_SUBMITTED/);

    const closedWithoutOpinion = await readyM6({ phaseStatus: 'closed' });
    await assert.rejects(
      site.submitInspectionVerdict(closedWithoutOpinion.phase, closedWithoutOpinion.agent, 'compliant', 'ok'),
      /PHASE_ALREADY_CLOSED/
    );
    const closedDossier = await readyM6({ dossierStatus: 'rejected' });
    await assert.rejects(site.submitInspectionVerdict(closedDossier.phase, closedDossier.agent, 'compliant', 'ok'), /DOSSIER_CLOSED/);
    await assert.rejects(site.submitInspectionVerdict(2147000000, m6.agent, 'compliant', 'ok'), /PHASE_NOT_FOUND/);
  });
});
