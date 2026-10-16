/** SESSION1-COCKPIT-1 B4 - a site visit is recorded as held only once its M6
 *  payment is validated; compare-and-set on 'scheduled'. Real PostgreSQL
 *  (skipped without DATABASE_URL; needs a migrated, disposable database). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('SESSION1-COCKPIT-1 B4 site visit held (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let site: typeof import('./site-inspection.service.js');
  let closeAppPool: () => Promise<void>;
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    site = await import('./site-inspection.service.js');
    const dbModule = await import('../../shared/db/index.js');
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  async function user() {
    const code = `SH${tag}${++n}`;
    return (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent CI', $2) RETURNING id`, [code, `${code}@test.local`])).id as number;
  }

  async function dossier(status = 'in_progress') {
    const k = `${tag}-${++n}`;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA SH ${k}`])).id as number;
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`, [org, `sh-${k}@test.local`])).id as number;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-SH-${k}`, applicant, org, status]
    )).id as number;
    const phase = (await one(`INSERT INTO phases (request_id, phase_code, status) VALUES ($1, 'M6', 'open') RETURNING id`, [request])).id as number;
    return { request, phase };
  }

  const payment = (phaseId: number, status: string) =>
    pool.query(`INSERT INTO payments (phase_id, status) VALUES ($1, $2)`, [phaseId, status]);

  async function siteVisit(phaseId: number, agentId: number, status = 'scheduled') {
    return (await one(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status)
       VALUES ($1, 'site_visit', $2, now() + interval '1 day', $3, 'not_required') RETURNING id`,
      [phaseId, agentId, status]
    )).id as number;
  }

  const heldAudits = async (visit: number) =>
    Number((await one(`SELECT count(*) FROM audit_logs WHERE action = 'SITE_VISIT_HELD' AND entity_id = $1`, [visit])).count);
  const statusOf = async (visit: number) => (await one(`SELECT status FROM meetings WHERE id = $1`, [visit])).status;

  it('B4: refused while the payment is not validated; the visit stays scheduled; no audit row', async () => {
    for (const status of ['awaiting_invoice', 'awaiting_proof', 'pending_validation']) {
      const agent = await user();
      const d = await dossier();
      await payment(d.phase, status);
      const visit = await siteVisit(d.phase, agent);
      await assert.rejects(site.markAssignedSiteVisitHeld(visit, agent), /SITE_VISIT_PAYMENT_NOT_VALIDATED/, status);
      assert.equal(await statusOf(visit), 'scheduled');
      assert.equal(await heldAudits(visit), 0);
    }
  });

  it('B4: refused when the phase has no payment row at all', async () => {
    const agent = await user();
    const d = await dossier();
    const visit = await siteVisit(d.phase, agent);
    await assert.rejects(site.markAssignedSiteVisitHeld(visit, agent), /SITE_VISIT_PAYMENT_NOT_VALIDATED/);
    assert.equal(await statusOf(visit), 'scheduled');
  });

  it('B4: accepted once the payment is validated', async () => {
    const agent = await user();
    const d = await dossier();
    await payment(d.phase, 'validated');
    const visit = await siteVisit(d.phase, agent);
    const view = await site.markAssignedSiteVisitHeld(visit, agent);
    assert.equal(view.status, 'held');
    assert.equal(await statusOf(visit), 'held');
    assert.equal(await heldAudits(visit), 1);
  });

  it('scheduling before payment is still allowed', async () => {
    const agent = await user();
    const d = await dossier();
    await payment(d.phase, 'awaiting_invoice');
    const scheduled = await site.scheduleSiteVisit({
      phaseId: d.phase,
      r3AgentId: agent,
      scheduledAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      location: 'Port-Gentil',
      actorUserId: agent,
    });
    assert.equal(scheduled.meeting.status, 'scheduled');
  });

  it('guard order: closed dossier → DOSSIER_CLOSED; other agent → SITE_VISIT_NOT_ASSIGNED; already held → MEETING_NOT_SCHEDULED; then payment', async () => {
    const agent = await user();
    const other = await user();

    const closed = await dossier('rejected');
    await payment(closed.phase, 'awaiting_invoice');
    const closedVisit = await siteVisit(closed.phase, agent);
    await assert.rejects(site.markAssignedSiteVisitHeld(closedVisit, agent), /DOSSIER_CLOSED/);

    const open = await dossier();
    await payment(open.phase, 'awaiting_invoice');
    const visit = await siteVisit(open.phase, agent);
    await assert.rejects(site.markAssignedSiteVisitHeld(visit, other), /SITE_VISIT_NOT_ASSIGNED/);

    const heldD = await dossier();
    await payment(heldD.phase, 'awaiting_invoice');
    const heldVisit = await siteVisit(heldD.phase, agent, 'held');
    await assert.rejects(site.markAssignedSiteVisitHeld(heldVisit, agent), /MEETING_NOT_SCHEDULED/);
    for (const id of [closedVisit, visit, heldVisit]) assert.equal(await heldAudits(id), 0);
  });

  it('two concurrent « held » calls: exactly one succeeds, the other is MEETING_NOT_SCHEDULED; one audit row', async () => {
    const agent = await user();
    const d = await dossier();
    await payment(d.phase, 'validated');
    const visit = await siteVisit(d.phase, agent);
    const results = await Promise.allSettled([site.markAssignedSiteVisitHeld(visit, agent), site.markAssignedSiteVisitHeld(visit, agent)]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    assert.match(String(rejected.reason), /MEETING_NOT_SCHEDULED/);
    assert.equal(await heldAudits(visit), 1);
  });

  it('M3 deterministic CAS: an update blocked on a row lock, released after the row became held, is MEETING_NOT_SCHEDULED; no audit row', async () => {
    const agent = await user();
    const d = await dossier();
    await payment(d.phase, 'validated');
    const visit = await siteVisit(d.phase, agent);
    const locker = new pg.Client({ connectionString: DATABASE_URL });
    await locker.connect();
    try {
      await locker.query('BEGIN');
      await locker.query(`UPDATE meetings SET status = 'held' WHERE id = $1`, [visit]);
      const pending = site.markAssignedSiteVisitHeld(visit, agent);
      const settled = pending.then(() => null, (error: unknown) => error);
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (!blocked && Date.now() < deadline) {
        const { rows } = await pool.query(
          `SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE 'update "meetings"%'`
        );
        blocked = rows.length > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(blocked, true, 'the service update is waiting on the row lock');
      await locker.query('COMMIT');
      const error = await settled;
      assert.match(String(error), /MEETING_NOT_SCHEDULED/);
      assert.equal(await heldAudits(visit), 0);
    } finally {
      await locker.query('ROLLBACK').catch(() => undefined);
      await locker.end();
    }
  });

  it('the verdict payment guard is unchanged: held + unpaid → PAYMENT_NOT_VALIDATED', async () => {
    const agent = await user();
    const d = await dossier();
    await payment(d.phase, 'awaiting_proof');
    await siteVisit(d.phase, agent, 'held');
    await assert.rejects(site.submitInspectionVerdict(d.phase, agent, 'compliant', 'ok'), /PAYMENT_NOT_VALIDATED/);
  });
});
