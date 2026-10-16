/** SESSION1-COCKPIT-1 §5.3 - the Finance queue against a real PostgreSQL
 *  (skipped without DATABASE_URL; needs a migrated, disposable database). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { OPERATIONAL_OWNERS } from '@aidn/shared';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('SESSION1-COCKPIT-1 Finance queue (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let finance: typeof import('./finance-queue.js');
  let appPool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    finance = await import('./finance-queue.js');
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

  /** One dossier (own organisation and applicant) with the requested phases, all open. */
  async function dossier(codes: string[], status = 'in_progress') {
    const k = `${tag}-${++n}`;
    const org = (await one(
      `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
      [`OMA FQ ${k}`]
    )).id as number;
    const applicant = (await one(
      `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`,
      [org, `fq-${k}@test.local`]
    )).id as number;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status)
       VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-FQ-${k}`, applicant, org, status]
    )).id as number;
    const phase: Record<string, number> = {};
    for (const code of codes) {
      phase[code] = (await one(`INSERT INTO phases (request_id, phase_code, status) VALUES ($1, $2, 'open') RETURNING id`, [request, code])).id;
    }
    return { request, phase };
  }

  async function payment(
    phaseId: number,
    over: {
      status?: string;
      invoiceUploadedAt?: string | null;
      proofUploadedAt?: string | null;
      validatedAt?: string | null;
      rejectionReason?: string | null;
      rejectionAction?: string | null;
    } = {}
  ) {
    await pool.query(
      `INSERT INTO payments (phase_id, status, invoice_uploaded_at, proof_uploaded_at, validated_at, rejection_reason, rejection_action)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [phaseId, over.status ?? 'awaiting_invoice', over.invoiceUploadedAt ?? null, over.proofUploadedAt ?? null, over.validatedAt ?? null, over.rejectionReason ?? null, over.rejectionAction ?? null]
    );
  }

  const openedDaysAgo = (phaseId: number, days: number) =>
    pool.query(`UPDATE phases SET opened_at = now() - ($2 || ' days')::interval WHERE id = $1`, [phaseId, String(days)]);
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  const find = async (phaseId: number) => (await finance.getFinanceQueue()).items.find((i) => i.phaseId === phaseId)!;

  it('awaiting_invoice: invoice_to_send / Finance / send_invoice; B2: urgency from the phase opening', async () => {
    const d = await dossier(['M5']);
    await payment(d.phase.M5, { status: 'awaiting_invoice' });
    await openedDaysAgo(d.phase.M5, 5); // default target 2 days
    const item = await find(d.phase.M5);
    assert.deepEqual(
      [item.bucket, item.state, item.owner, item.actionKey, item.urgency],
      ['invoice_to_send', 'action_required', OPERATIONAL_OWNERS.finance, 'send_invoice', 'overdue']
    );
    assert.equal(item.stepSince, item.phaseOpenedAt.toISOString());
  });

  it('pending_validation: proof_to_validate; urgency from proofUploadedAt', async () => {
    const d = await dossier(['M6']);
    await payment(d.phase.M6, { status: 'pending_validation', invoiceUploadedAt: daysAgo(10), proofUploadedAt: daysAgo(3) }); // target 1 day
    const item = await find(d.phase.M6);
    assert.deepEqual(
      [item.bucket, item.state, item.owner, item.actionKey, item.urgency],
      ['proof_to_validate', 'action_required', OPERATIONAL_OWNERS.finance, 'validate_payment_proof', 'overdue']
    );
    assert.equal(item.stepSince, item.payment.proofUploadedAt!.toISOString());
  });

  it('awaiting_proof: awaiting_applicant / waiting / Postulant; never overdue (no + 4 j rule)', async () => {
    const d = await dossier(['M7']);
    await payment(d.phase.M7, { status: 'awaiting_proof', invoiceUploadedAt: daysAgo(30) });
    const item = await find(d.phase.M7);
    assert.deepEqual(
      [item.bucket, item.state, item.owner, item.actionKey, item.urgency],
      ['awaiting_applicant', 'waiting', OPERATIONAL_OWNERS.applicant, 'await_payment_proof', 'normal']
    );
    assert.equal(item.newProofRequested, false);
  });

  it('B3: a new proof requested shows newProofRequested and the reason; a rejected dossier is done, not work', async () => {
    const d = await dossier(['M5']);
    await payment(d.phase.M5, {
      status: 'awaiting_proof',
      invoiceUploadedAt: daysAgo(2),
      rejectionReason: 'Montant illisible',
      rejectionAction: 'request_new_proof',
    });
    const requested = await find(d.phase.M5);
    assert.equal(requested.newProofRequested, true);
    assert.equal(requested.payment.rejectionReason, 'Montant illisible');
    assert.equal(requested.payment.rejectionAction, 'request_new_proof');

    const r = await dossier(['M5'], 'rejected');
    await payment(r.phase.M5, { status: 'rejected', proofUploadedAt: daysAgo(4), rejectionReason: 'Fraude', rejectionAction: 'reject_dossier' });
    const rejected = await find(r.phase.M5);
    assert.deepEqual(
      [rejected.bucket, rejected.state, rejected.blockReason, rejected.owner],
      ['done', 'done', 'dossier_closed', null]
    );
  });

  it('B1: pending payment on a closed dossier is inactive and outside the action counts', async () => {
    const before = (await finance.getFinanceQueue()).counts;
    const d = await dossier(['M5'], 'cancelled');
    await payment(d.phase.M5, { status: 'pending_validation', proofUploadedAt: daysAgo(3) });
    const queue = await finance.getFinanceQueue();
    const item = queue.items.find((i) => i.phaseId === d.phase.M5)!;
    assert.deepEqual([item.bucket, item.state, item.blockReason, item.actionKey, item.dossierClosed], ['inactive', 'done', 'dossier_closed', 'none', true]);
    assert.equal(queue.counts.proof_to_validate, before.proof_to_validate);
    assert.equal(queue.counts.inactive, before.inactive + 1);
  });

  it('validated: done; M5, M6 and M7 all listed with their phaseCode', async () => {
    const d = await dossier(['M5', 'M6', 'M7']);
    for (const code of ['M5', 'M6', 'M7']) await payment(d.phase[code], { status: 'validated', validatedAt: daysAgo(1) });
    const queue = await finance.getFinanceQueue();
    for (const code of ['M5', 'M6', 'M7']) {
      const item = queue.items.find((i) => i.phaseId === d.phase[code])!;
      assert.equal(item.phaseCode, code);
      assert.equal(item.bucket, 'done');
      assert.equal(item.actionKey, 'none');
      assert.equal(item.owner, null);
    }
  });

  it('issues exactly 2 queries whatever the number of payments', async () => {
    const d = await dossier(['M5']);
    await payment(d.phase.M5, { status: 'awaiting_invoice' });
    const first = await countQueries(() => finance.getFinanceQueue());
    for (let i = 0; i < 4; i += 1) {
      const more = await dossier(['M6']);
      await payment(more.phase.M6, { status: 'pending_validation', proofUploadedAt: daysAgo(1) });
    }
    const second = await countQueries(() => finance.getFinanceQueue());
    assert.equal(first.count, 2);
    assert.equal(second.count, 2);
  });
});
