/** SESSION1-COCKPIT-1 - the Cellule Inspection queue read model against a real
 *  PostgreSQL (skipped without DATABASE_URL; needs a migrated, disposable
 *  database). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { OPERATIONAL_OWNERS } from '@aidn/shared';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('SESSION1-COCKPIT-1 Inspection queue (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let appPool: pg.Pool;
  let site: typeof import('./site-inspection.service.js');
  let closeAppPool: () => Promise<void>;
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    site = await import('./site-inspection.service.js');
    const dbModule = await import('../../shared/db/index.js');
    appPool = dbModule.db.$client as pg.Pool;
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  async function countQueries<T>(run: () => Promise<T>): Promise<{ count: number; value: T }> {
    const original = appPool.query.bind(appPool);
    let count = 0;
    (appPool as unknown as { query: unknown }).query = (...args: unknown[]) => {
      count += 1;
      return (original as (...a: unknown[]) => unknown)(...args);
    };
    try {
      const value = await run();
      return { count, value };
    } finally {
      (appPool as unknown as { query: unknown }).query = original;
    }
  }

  async function user() {
    const code = `IQ${tag}${++n}`;
    return (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent CI', $2) RETURNING id`, [code, `${code}@test.local`])).id as number;
  }

  /** An M6 mission: dossier, phase, optional payment, one site visit. */
  async function mission(
    agent: number,
    over: { requestStatus?: string; payment?: string | null; visit?: string; scheduledAt?: Date; phaseStatus?: string } = {}
  ) {
    const k = `${tag}-${++n}`;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA IQ ${k}`])).id as number;
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`, [org, `iq-${k}@test.local`])).id as number;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-IQ-${k}`, applicant, org, over.requestStatus ?? 'in_progress']
    )).id as number;
    const phase = (await one(`INSERT INTO phases (request_id, phase_code, status) VALUES ($1, 'M6', $2) RETURNING id`, [request, over.phaseStatus ?? 'open'])).id as number;
    if (over.payment !== null) {
      await pool.query(`INSERT INTO payments (phase_id, status) VALUES ($1, $2)`, [phase, over.payment ?? 'validated']);
    }
    const scheduledAt = over.scheduledAt ?? new Date(Date.now() + 3 * 86_400_000);
    const visit = (await one(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status)
       VALUES ($1, 'site_visit', $2, $3, $4, 'not_required') RETURNING id`,
      [phase, agent, scheduledAt.toISOString(), over.visit ?? 'scheduled']
    )).id as number;
    return { request, phase, visit, scheduledAt };
  }

  const find = async (agent: number, phase: number, now?: Date) => {
    const queue = await site.getMyQueue({ userId: agent, roles: ['r3_agent'] }, now);
    return queue.items.find((i) => i.phaseId === phase)!;
  };

  it('payment not validated: awaiting_payment / blocked / payment_not_validated; owner follows the payment', async () => {
    const agent = await user();
    const expected: Array<[string | null, unknown]> = [
      ['awaiting_invoice', OPERATIONAL_OWNERS.finance],
      ['awaiting_proof', OPERATIONAL_OWNERS.applicant],
      ['pending_validation', OPERATIONAL_OWNERS.finance],
      [null, OPERATIONAL_OWNERS.finance],
    ];
    for (const [status, owner] of expected) {
      const m = await mission(agent, { payment: status });
      const item = await find(agent, m.phase);
      assert.deepEqual(
        [item.bucket, item.state, item.blockReason, item.actionKey, item.owner],
        ['awaiting_payment', 'blocked', 'payment_not_validated', 'await_payment', owner],
        String(status)
      );
    }
  });

  it('paid + scheduled: to_hold / action_required / Cellule Inspection / record_visit_held; dueAt = scheduledAt; urgency by visit day', async () => {
    const agent = await user();
    const now = new Date(2026, 5, 15, 10, 0, 0);
    const cases: Array<[Date, string]> = [
      [new Date(2026, 5, 16, 9, 0, 0), 'normal'],
      [new Date(2026, 5, 15, 16, 0, 0), 'warning'],
      [new Date(2026, 5, 14, 9, 0, 0), 'overdue'],
    ];
    for (const [scheduledAt, urgency] of cases) {
      const m = await mission(agent, { scheduledAt });
      const item = await find(agent, m.phase, now);
      assert.deepEqual(
        [item.bucket, item.state, item.owner, item.actionKey, item.blockReason, item.urgency],
        ['to_hold', 'action_required', OPERATIONAL_OWNERS.inspection, 'record_visit_held', null, urgency]
      );
      assert.equal(item.dueAt, scheduledAt.toISOString());
    }
  });

  it('held: verdict_due / submit_verdict', async () => {
    const agent = await user();
    const m = await mission(agent, { visit: 'held' });
    const item = await find(agent, m.phase);
    assert.deepEqual(
      [item.bucket, item.state, item.owner, item.actionKey],
      ['verdict_due', 'action_required', OPERATIONAL_OWNERS.inspection, 'submit_verdict']
    );
  });

  it('verdict recorded or phase closed: closed / done', async () => {
    const agent = await user();
    const withVerdict = await mission(agent, { visit: 'held' });
    await pool.query(`INSERT INTO site_inspections (phase_id, meeting_id, r3_agent_id, verdict, note) VALUES ($1, $2, $3, 'compliant', 'ok')`, [withVerdict.phase, withVerdict.visit, agent]);
    const closedPhase = await mission(agent, { visit: 'held', phaseStatus: 'closed' });
    for (const m of [withVerdict, closedPhase]) {
      const item = await find(agent, m.phase);
      assert.deepEqual([item.bucket, item.state, item.owner, item.actionKey], ['closed', 'done', null, 'none']);
    }
  });

  it('B5/B1: closed dossier: inactive / dossier_closed, outside the action counts', async () => {
    const agent = await user();
    const m = await mission(agent, { requestStatus: 'rejected' });
    const queue = await site.getMyQueue({ userId: agent, roles: ['r3_agent'] });
    const item = queue.items.find((i) => i.phaseId === m.phase)!;
    assert.deepEqual(
      [item.bucket, item.state, item.blockReason, item.actionKey, item.owner, item.dossierClosed],
      ['inactive', 'done', 'dossier_closed', 'none', null, true]
    );
    assert.equal(queue.counts.to_hold, 0);
    assert.equal(queue.counts.verdict_due, 0);
    assert.equal(queue.counts.inactive, 1);
  });

  it('D14: an agent sees only their missions; SU sees every mission; assignedToViewer is per viewer', async () => {
    const a = await user();
    const b = await user();
    await mission(a);
    await mission(b);
    const asA = await site.getMyQueue({ userId: a, roles: ['r3_agent'] });
    assert.ok(asA.items.length > 0);
    assert.ok(asA.items.every((i) => i.assignedToViewer));
    assert.equal(asA.items.some((i) => i.siteVisit.r3AgentId === b), false);
    const asSu = await site.getMyQueue({ userId: a, roles: ['SU', 'r3_agent'] });
    assert.ok(asSu.items.some((i) => i.siteVisit.r3AgentId === b && i.assignedToViewer === false));
    assert.ok(asSu.items.some((i) => i.siteVisit.r3AgentId === a && i.assignedToViewer === true));
  });

  it('no French label in the read model; assignedAgentName is set', async () => {
    const agent = await user();
    const m = await mission(agent);
    const item = await find(agent, m.phase);
    assert.equal('statusLabel' in item, false);
    assert.equal('nextActionLabel' in item, false);
    assert.equal(item.assignedAgentName, 'Agent CI');
    assert.equal(item.id, `site_visit:${m.visit}`);
  });

  it('I1: a no_show visit then a new scheduled visit on the same phase: two items, distinct ids', async () => {
    const agent = await user();
    const m = await mission(agent, { visit: 'no_show' });
    const second = (await one(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status)
       VALUES ($1, 'site_visit', $2, $3, 'scheduled', 'not_required') RETURNING id`,
      [m.phase, agent, new Date(Date.now() + 5 * 86_400_000).toISOString()]
    )).id as number;
    const queue = await site.getMyQueue({ userId: agent, roles: ['r3_agent'] });
    const items = queue.items.filter((i) => i.phaseId === m.phase);
    assert.equal(items.length, 2);
    assert.equal(new Set(items.map((i) => i.id)).size, 2);
    const noShow = items.find((i) => i.id === `site_visit:${m.visit}`)!;
    const scheduled = items.find((i) => i.id === `site_visit:${second}`)!;
    assert.deepEqual([noShow.bucket, noShow.state, noShow.actionKey], ['inactive', 'done', 'none']);
    assert.deepEqual([scheduled.bucket, scheduled.actionKey], ['to_hold', 'record_visit_held']);
  });

  it('issues exactly 1 query for an agent and for SU, whatever the number of missions', async () => {
    const agent = await user();
    for (let i = 0; i < 3; i++) await mission(agent);
    const asAgent = await countQueries(() => site.getMyQueue({ userId: agent, roles: ['r3_agent'] }));
    assert.ok(asAgent.value.items.length >= 3);
    assert.equal(asAgent.count, 1);
    const asSu = await countQueries(() => site.getMyQueue({ userId: agent, roles: ['SU'] }));
    assert.equal(asSu.count, 1);
  });
});
