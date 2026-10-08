/** K7b - GET /phases/requests/:id/dossier-state tells a phase page whether the
 *  dossier is closed (then the page is read-only). Real PostgreSQL, skipped
 *  without DATABASE_URL. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('K7b dossier state (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  let getDossierState: typeof import('./phases.service.js').getDossierState;
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const [svc, dbModule] = await Promise.all([
      import('./phases.service.js'),
      import('../../shared/db/index.js'),
    ]);
    getDossierState = svc.getDossierState;
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  async function seedRequest(status: string, rejectionReason: string | null = null) {
    const k = `${tag}${n++}`;
    const org = (await one(
      `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
      [`OMA K7b ${k}`]
    )).id;
    const applicant = (await one(
      `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`,
      [org, `k7b-${k}@t.local`]
    )).id;
    return (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status, rejection_reason, updated_at)
       VALUES ($1, $2, $3, 'issuance', $4, $5, '2026-10-02T08:00:00Z') RETURNING id`,
      [`DEM-K7B-${k}`, applicant, org, status, rejectionReason]
    )).id as number;
  }

  it('rejected: closed, closing date and reason', async () => {
    const id = await seedRequest('rejected', 'Paiement rejeté - dossier annulé : test');
    const state = await getDossierState(id);
    assert.equal(state.status, 'rejected');
    assert.equal(state.closed, true);
    assert.equal(state.closedAt?.toISOString(), '2026-10-02T08:00:00.000Z');
    assert.equal(state.rejectionReason, 'Paiement rejeté - dossier annulé : test');
  });

  it('cancelled and completed: closed, no reason', async () => {
    for (const status of ['cancelled', 'completed']) {
      const state = await getDossierState(await seedRequest(status, 'stale text'));
      assert.equal(state.closed, true, status);
      assert.ok(state.closedAt, status);
      assert.equal(state.rejectionReason, null, status);
    }
  });

  it('open statuses: not closed, no date, no reason', async () => {
    for (const status of ['pending_review', 'in_progress']) {
      const state = await getDossierState(await seedRequest(status));
      assert.deepEqual(state, { status, closed: false, closedAt: null, rejectionReason: null });
    }
  });

  it('unknown dossier: REQUEST_NOT_FOUND (404)', async () => {
    await assert.rejects(getDossierState(2_000_000_000), /REQUEST_NOT_FOUND/);
  });
});
