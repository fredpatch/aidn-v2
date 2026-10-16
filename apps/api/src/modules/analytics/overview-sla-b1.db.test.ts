/** ROLE-ANALYTICS-1B - global overview against a real PostgreSQL (skipped
 *  without DATABASE_URL): phase SLA targets come from the system parameters,
 *  and closed dossiers are not current blockers (B1). The database may hold
 *  other data, so assertions compare against a baseline taken first. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { pgConnectionConfig } from '../../shared/db/connection.js';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';
const DAY = 86_400_000;
const M3_KEY = 'dashboard_sla_phase_m3_days';

describe('analytics overview: SLA parameters and B1 (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let analytics: typeof import('./analytics.service.js');
  let closeAppPool: () => Promise<void>;
  const tag = Date.now().toString(36);
  let n = 0;
  const created = { requests: [] as number[], applicants: [] as number[], organisations: [] as number[] };
  let savedM3: { value: string } | null = null;

  before(async () => {
    pool = new pg.Pool(pgConnectionConfig(DATABASE_URL));
    analytics = await import('./analytics.service.js');
    const dbModule = await import('../../shared/db/index.js');
    closeAppPool = () => dbModule.db.$client.end();
    savedM3 = (await pool.query(`SELECT value FROM system_parameters WHERE key = $1`, [M3_KEY])).rows[0] ?? null;
  });

  after(async () => {
    const ids = created.requests;
    if (ids.length) {
      await pool.query(`DELETE FROM payments WHERE phase_id IN (SELECT id FROM phases WHERE request_id = ANY($1))`, [ids]);
      await pool.query(`DELETE FROM dg_circuit_documents WHERE request_id = ANY($1)`, [ids]);
      await pool.query(`DELETE FROM phases WHERE request_id = ANY($1)`, [ids]);
      await pool.query(`DELETE FROM requests WHERE id = ANY($1)`, [ids]);
    }
    if (created.applicants.length) await pool.query(`DELETE FROM applicants WHERE id = ANY($1)`, [created.applicants]);
    if (created.organisations.length) await pool.query(`DELETE FROM organisations WHERE id = ANY($1)`, [created.organisations]);
    if (savedM3) await setM3(savedM3.value);
    else await pool.query(`DELETE FROM system_parameters WHERE key = $1`, [M3_KEY]);
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  async function setM3(value: string) {
    await pool.query(
      `INSERT INTO system_parameters (key, value, type, module) VALUES ($1, $2, 'integer', 'M3')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [M3_KEY, value]
    );
  }

  async function dossier(status: string) {
    const k = `${tag}-${++n}`;
    const org = await one(
      `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
      [`OMA 1B ${k}`]
    );
    created.organisations.push(org.id);
    const applicant = await one(
      `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`,
      [org.id, `p-1b-${k}@test.local`]
    );
    created.applicants.push(applicant.id);
    const request = await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status)
       VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-1B-${k}`, applicant.id, org.id, status]
    );
    created.requests.push(request.id);
    return request.id as number;
  }

  async function openPhase(requestId: number, code: string, daysAgo: number) {
    return (await one(
      `INSERT INTO phases (request_id, phase_code, opened_at) VALUES ($1, $2, now() - ($3 || ' days')::interval) RETURNING id`,
      [requestId, code, String(daysAgo)]
    )).id as number;
  }

  async function overview() {
    const filters = analytics.defaultAnalyticsFilters();
    filters.periodStart = new Date(Date.now() - 365 * DAY);
    filters.periodEnd = new Date(Date.now() + DAY);
    return analytics.getAnalyticsOverview(filters);
  }

  const metric = (o: Awaited<ReturnType<typeof overview>>, key: string) =>
    Number(o.metrics.find((item) => item.key === key)?.value);
  const blocker = (o: Awaited<ReturnType<typeof overview>>, key: string) =>
    Number(o.blockingPoints.find((item) => item.key === key)?.value);
  const phase = (o: Awaited<ReturnType<typeof overview>>, code: string) => o.phaseStats.find((item) => item.phaseCode === code)!;

  it('uses the configured phase SLA, not a hardcoded target', async () => {
    const requestId = await dossier('in_progress');
    await openPhase(requestId, 'M3', 5);

    await setM3('100000');
    const relaxed = await overview();
    assert.equal(phase(relaxed, 'M3').slaTargetDays, 100000);
    assert.equal(phase(relaxed, 'M3').slaBreachCount, 0);

    await setM3('2');
    const strict = await overview();
    assert.equal(phase(strict, 'M3').slaTargetDays, 2);
    assert.ok(phase(strict, 'M3').slaBreachCount >= 1, 'the 5-day-old M3 phase breaches a 2-day target');
    assert.ok(metric(strict, 'outside_sla') >= metric(relaxed, 'outside_sla') + 1);
    assert.ok(strict.delayedDossiers.length >= 1);
  });

  it('B1: rejected, cancelled and completed dossiers are not current blockers; active ones are', async () => {
    if (savedM3) await setM3(savedM3.value);
    const before = await overview();

    for (const status of ['rejected', 'cancelled', 'completed', 'in_progress']) {
      const requestId = await dossier(status);
      await openPhase(requestId, 'M3', 400); // beyond any configured target
      const m5 = await openPhase(requestId, 'M5', 1);
      await pool.query(`INSERT INTO payments (phase_id, status) VALUES ($1, 'pending_validation')`, [m5]);
      await pool.query(
        `INSERT INTO dg_circuit_documents (entity_type, request_id, status, signature_sent_at)
         VALUES ('formal_request_letter', $1, 'in_signature_circuit', now())`,
        [requestId]
      );
      if (status === 'completed') {
        const m7 = await openPhase(requestId, 'M7', 10);
        await pool.query(`UPDATE phases SET status = 'closed', closed_at = now() WHERE id = $1`, [m7]);
      }
    }

    const after = await overview();
    // Only the active dossier is counted in current blockers.
    assert.equal(blocker(after, 'dg_waiting') - blocker(before, 'dg_waiting'), 1);
    assert.equal(blocker(after, 'payment_blockers') - blocker(before, 'payment_blockers'), 1);
    assert.equal(metric(after, 'outside_sla') - metric(before, 'outside_sla'), 1);
    assert.equal(phase(after, 'M3').activeCount - phase(before, 'M3').activeCount, 1);
    assert.equal(phase(after, 'M5').activeCount - phase(before, 'M5').activeCount, 1);
    // History keeps closed dossiers: the completed dossier's M7 closed in the period.
    assert.equal(phase(after, 'M7').closedCount - phase(before, 'M7').closedCount, 1);
  });
});
