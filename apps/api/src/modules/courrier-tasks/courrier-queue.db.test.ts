/** SESSION1-COCKPIT-1 - courrier queue read model: bucket / state / owner /
 *  actionKey / blockReason / urgency computed server-side. Real PostgreSQL,
 *  skipped without DATABASE_URL. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { OPERATIONAL_OWNERS } from '@aidn/shared';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('SESSION1-COCKPIT-1 courrier queue (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let appPool: pg.Pool;
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

  async function circuit(
    entityType: 'intake_request' | 'formal_request_letter' | 'pre_evaluation',
    status: string,
    opts: { requestStatus?: string; phaseStatus?: string; depositedAt?: Date; signatureSentAt?: Date } = {}
  ) {
    const k = `${tag}${++n}`;
    const org = (
      await one(
        `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
        [`OMA CQ ${k}`]
      )
    ).id;
    const applicant = (
      await one(
        `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`,
        [org, `cq-${k}@t.local`]
      )
    ).id;
    const request = (
      await one(
        `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
        [`DEM-CQ-${k}`, applicant, org, opts.requestStatus ?? 'in_progress']
      )
    ).id;
    const phaseCode = entityType === 'pre_evaluation' ? 'M3' : entityType === 'formal_request_letter' ? 'M4' : null;
    if (phaseCode) {
      await pool.query(`INSERT INTO phases (request_id, phase_code, status) VALUES ($1, $2, $3)`, [
        request,
        phaseCode,
        opts.phaseStatus ?? 'open',
      ]);
    }
    await pool.query(
      `INSERT INTO dg_circuit_documents (entity_type, request_id, status, deposited_at, signature_sent_at, signed_at, pending_review_at)
       VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), $5::timestamptz,
         CASE WHEN $6::text IN ('pending_review','signed') THEN now() END,
         CASE WHEN $6::text = 'pending_review' THEN now() END)`,
      [entityType, request, status, opts.depositedAt ?? null, opts.signatureSentAt ?? null, status]
    );
    return { request: request as number };
  }

  const find = async (requestId: number) =>
    (await service.listCourrierTasks({})).items.find((item: { requestId: number }) => item.requestId === requestId)!;

  it('submitted, phase open: to_print / action_required / Réception / print_for_dg', async () => {
    const d = await circuit('formal_request_letter', 'submitted');
    const item = await find(d.request);
    assert.equal(item.bucket, 'to_print');
    assert.equal(item.state, 'action_required');
    assert.deepEqual(item.owner, OPERATIONAL_OWNERS.reception);
    assert.equal(item.actionKey, 'print_for_dg');
    assert.equal(item.blockReason, null);
    assert.equal(item.circuitStep, 'deposited');
  });

  it('submitted for 3 calendar days with the default 1-day deposit target: overdue', async () => {
    const d = await circuit('intake_request', 'submitted', { depositedAt: new Date(Date.now() - 3 * 86_400_000) });
    assert.equal((await find(d.request)).urgency, 'overdue');
  });

  it('in signature: with_dg / waiting / Assistant DG / record_dg_annotation; late = overdue', async () => {
    const d = await circuit('formal_request_letter', 'in_signature_circuit', { signatureSentAt: new Date(Date.now() - 20 * 86_400_000) });
    const item = await find(d.request);
    assert.equal(item.bucket, 'with_dg');
    assert.equal(item.state, 'waiting');
    assert.deepEqual(item.owner, OPERATIONAL_OWNERS.assistantDg);
    assert.equal(item.actionKey, 'record_dg_annotation');
    assert.equal(item.signatureLate, true);
    assert.equal(item.urgency, 'overdue');
  });

  it('B6: a returned initial request is handed to the Assistante DN; a returned letter to the DN', async () => {
    const intake = await circuit('intake_request', 'pending_review');
    const letter = await circuit('formal_request_letter', 'pending_review');
    const a = await find(intake.request);
    const b = await find(letter.request);
    assert.deepEqual([a.bucket, a.state, a.owner, a.actionKey], ['returned', 'done', null, 'handed_to_assistant_dn']);
    assert.deepEqual([b.bucket, b.actionKey], ['returned', 'handed_to_dn']);
  });

  it('B1: pending on a closed dossier is inactive (in items), never in an action bucket count', async () => {
    const before = (await service.listCourrierTasks({})).counts;
    const d = await circuit('formal_request_letter', 'submitted', { requestStatus: 'rejected' });
    const list = await service.listCourrierTasks({});
    const item = list.items.find((i: { requestId: number }) => i.requestId === d.request)!;
    assert.deepEqual([item.bucket, item.state, item.owner, item.actionKey, item.blockReason], ['inactive', 'done', null, 'none', 'dossier_closed']);
    assert.equal(list.counts.to_print, before.to_print);
    assert.equal(list.counts.with_dg, before.with_dg);
  });

  it('phase not open: inactive / blocked / owner DN / phase_not_open', async () => {
    const d = await circuit('formal_request_letter', 'submitted', { phaseStatus: 'closed' });
    const item = await find(d.request);
    assert.deepEqual([item.bucket, item.state, item.owner, item.blockReason], ['inactive', 'blocked', OPERATIONAL_OWNERS.dn, 'phase_not_open']);
  });

  it('legacy signed: inactive / done', async () => {
    const d = await circuit('formal_request_letter', 'signed');
    const item = await find(d.request);
    assert.deepEqual([item.bucket, item.state, item.circuitStep], ['inactive', 'done', 'legacy_signed']);
  });

  it('every bucket key is present; thresholds are returned; no French label', async () => {
    const list = await service.listCourrierTasks({});
    assert.deepEqual(Object.keys(list.counts).sort(), ['inactive', 'returned', 'to_print', 'with_dg']);
    assert.equal(typeof list.thresholds.dgAlertWorkingDays, 'number');
    assert.equal(typeof list.thresholds.depositDays, 'number');
    assert.equal('statusLabel' in list.items[0], false);
  });

  it('issues exactly 6 queries whatever the number of courriers', async () => {
    await circuit('formal_request_letter', 'submitted');
    const first = await countQueries(() => service.listCourrierTasks({}));
    for (let i = 0; i < 3; i += 1) await circuit('pre_evaluation', 'submitted');
    const second = await countQueries(() => service.listCourrierTasks({}));
    assert.equal(first.count, 6);
    assert.equal(second.count, 6);
  });
});
