/** D3b - « non lues » per agent (real PostgreSQL, skipped without
 *  DATABASE_URL): a dossier is unread until the agent opens it, becomes
 *  unread again when someone else acts on it, never because of the agent's
 *  own actions, and never when it is closed (K7). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('D3b request views and unread (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: Record<string, any>;
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const [auth, requestsService, dbModule] = await Promise.all([
      import('../auth/auth.service.js'),
      import('./requests.service.js'),
      import('../../shared/db/index.js'),
    ]);
    m = { auth, requests: requestsService };
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
  const pause = () => new Promise((resolve) => setTimeout(resolve, 15));

  async function agent() {
    const k = `${tag}${++n}`;
    return (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent D3b', $2) RETURNING id`, [`D3B${k}`, `d3b-${k}@t.local`])).id as number;
  }

  async function dossier(status = 'in_progress') {
    const k = `${tag}${++n}`;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA D3b ${k}`])).id;
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`, [org, `d3b-${k}@t.local`])).id;
    return (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status, created_at) VALUES ($1, $2, $3, 'issuance', $4, now() - interval '1 day') RETURNING id`,
      [`DEM-D3B-${k}`, applicant, org, status]
    )).id as number;
  }

  async function unread(request: number, viewer: number): Promise<boolean> {
    const item = (await m.requests.listRequestCockpit(viewer)).items.find((i: { id: number }) => i.id === request);
    assert.ok(item, 'listed');
    return item.unread;
  }

  it('unread until opened; unread again after another agent acts; own actions do not count', async () => {
    const me = await agent();
    const other = await agent();
    const request = await dossier();
    assert.equal(await unread(request, me), true, 'never opened');

    await m.requests.markRequestViewed(request, me);
    assert.equal(await unread(request, me), false, 'opened');
    assert.equal(await unread(request, other), true, 'per agent');

    await pause();
    await m.auth.logAudit({ userId: me, action: 'REQUEST_SUBMITTED', module: 'M1', entityId: request });
    assert.equal(await unread(request, me), false, 'own action');

    await pause();
    await m.auth.logAudit({ userId: other, action: 'DG_CIRCUIT_SIGNED', module: 'M1', entityId: request });
    assert.equal(await unread(request, me), true, "another agent's action");

    await pause();
    await m.auth.logAudit({ action: 'DG_CIRCUIT_ALERT_SENT', module: 'M1', entityId: request });
    await m.requests.markRequestViewed(request, me);
    assert.equal(await unread(request, me), false, 'reopened (upsert)');
    const rows = await pool.query(`SELECT count(*)::int AS c FROM request_views WHERE user_id = $1 AND request_id = $2`, [me, request]);
    assert.equal(rows.rows[0].c, 1);
  });

  it('a closed dossier (K7) is never unread', async () => {
    const me = await agent();
    for (const status of ['rejected', 'cancelled', 'completed']) {
      assert.equal(await unread(await dossier(status), me), false, status);
    }
  });

  it('opening an unknown dossier is REQUEST_NOT_FOUND', async () => {
    const me = await agent();
    await assert.rejects(m.requests.markRequestViewed(999_999_999, me), /REQUEST_NOT_FOUND/);
    await assert.rejects(m.requests.markRequestViewed(Number.NaN, me), /REQUEST_NOT_FOUND/);
  });

  it('isUnread: submission counts as news, viewer-less cockpit reports every open dossier unread', () => {
    const t = (s: string) => new Date(s);
    assert.equal(
      m.requests.isUnread({ closed: false, createdAt: t('2026-10-05'), lastOthersActivityAt: undefined, lastViewedAt: t('2026-10-04') }),
      true
    );
    assert.equal(
      m.requests.isUnread({ closed: false, createdAt: t('2026-10-01'), lastOthersActivityAt: t('2026-10-03'), lastViewedAt: t('2026-10-04') }),
      false
    );
  });
});
