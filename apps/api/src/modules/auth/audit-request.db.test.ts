/** D3a - audit events linked to their dossier (real PostgreSQL, skipped
 *  without DATABASE_URL): logAudit resolves request_id for every entity kind,
 *  migration 0005 backfills the same way, and the Demandes cockpit reads the
 *  activity of all phases plus lastActivityAt. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('D3a audit -> request link (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: Record<string, any>;
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const [auth, requestsService, dbModule] = await Promise.all([
      import('./auth.service.js'),
      import('../requests/requests.service.js'),
      import('../../shared/db/index.js'),
    ]);
    m = { auth, requests: requestsService };
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) =>
    (await pool.query(sql, params)).rows[0];

  /** A dossier with one entity of each kind the activity can point to. */
  async function dossier() {
    const k = `${tag}${++n}`;
    const user = (
      await one(
        `INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent D3a', $2) RETURNING id`,
        [`D3A${k}`, `d3a-${k}@t.local`]
      )
    ).id;
    const org = (
      await one(
        `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
        [`OMA D3a ${k}`]
      )
    ).id;
    const applicant = (
      await one(
        `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`,
        [org, `d3a-${k}@t.local`]
      )
    ).id;
    const request = (
      await one(
        `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status, created_at) VALUES ($1, $2, $3, 'issuance', 'in_progress', now() - interval '10 days') RETURNING id`,
        [`DEM-D3A-${k}`, applicant, org]
      )
    ).id;
    const m5 = (
      await one(`INSERT INTO phases (request_id, phase_code) VALUES ($1, 'M5') RETURNING id`, [
        request,
      ])
    ).id;
    const m3 = (
      await one(`INSERT INTO phases (request_id, phase_code) VALUES ($1, 'M3') RETURNING id`, [
        request,
      ])
    ).id;
    const payment = (
      await one(
        `INSERT INTO payments (phase_id, status) VALUES ($1, 'awaiting_invoice') RETURNING id`,
        [m5]
      )
    ).id;
    const meeting = (
      await one(
        `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status) VALUES ($1, 'preliminary', $2, now(), 'scheduled') RETURNING id`,
        [m3, user]
      )
    ).id;
    const circuit = (
      await one(
        `INSERT INTO dg_circuit_documents (entity_type, request_id, status) VALUES ('formal_request_letter', $1, 'submitted') RETURNING id`,
        [request]
      )
    ).id;
    return { user, request, m5, payment, meeting, circuit };
  }

  const linkOf = async (id: number) =>
    (await one(`SELECT request_id FROM audit_logs WHERE id = $1`, [id])).request_id;
  const lastAuditId = async () => (await one(`SELECT max(id) AS id FROM audit_logs`)).id as number;

  it('logAudit links each entity kind to its dossier; non-dossier events stay unlinked', async () => {
    const d = await dossier();
    const cases: Array<[string, string, number]> = [
      ['PHASE_OPENED', 'M5', d.m5],
      ['PAYMENT_VALIDATED', 'M5', d.payment],
      ['MEETING_NO_SHOW', 'M3', d.meeting],
      ['COURRIER_SENT_TO_SIGNATURE', 'M4', d.circuit],
      ['REQUEST_SUBMITTED', 'M1', d.request],
    ];
    for (const [action, module, entityId] of cases) {
      await m.auth.logAudit({ userId: d.user, action, module, entityId });
      assert.equal(await linkOf(await lastAuditId()), d.request, action);
    }
    await m.auth.logAudit({
      userId: d.user,
      action: 'USER_UPDATED',
      module: 'M13',
      entityId: d.user,
    });
    assert.equal(await linkOf(await lastAuditId()), null);
    // explicit requestId and details.requestId win over the entity lookup
    await m.auth.logAudit({
      action: 'DOCUMENT_VERDICT_SET',
      module: 'M5',
      entityId: 999_999,
      details: { requestId: d.request },
    });
    assert.equal(await linkOf(await lastAuditId()), d.request);
  });

  it('migration 0005 backfills past rows; an unknown entity stays NULL', async () => {
    const d = await dossier();
    const ids: number[] = [];
    for (const [action, module, entityId] of [
      ['PAYMENT_VALIDATED', 'M5', d.payment],
      ['MEETING_HELD', 'M3', d.meeting],
      ['PHASE_CLOSED', 'M5', d.m5],
      ['PAYMENT_REJECTED', 'M5', 999_999_999],
    ] as Array<[string, string, number]>) {
      ids.push(
        (
          await one(
            `INSERT INTO audit_logs (action, module, entity_id) VALUES ($1, $2, $3) RETURNING id`,
            [action, module, entityId]
          )
        ).id
      );
    }
    const sqlText = readFileSync(
      fileURLToPath(new URL('../../../drizzle/0005_d3a_audit_request.sql', import.meta.url)),
      'utf8'
    );
    // the DDL is already applied; replay the (re-runnable) backfill only
    for (const statement of sqlText
      .split('--> statement-breakpoint')
      .filter((s) => /^\s*(--.*\n\s*)*UPDATE/m.test(s))) {
      await pool.query(statement);
    }
    assert.deepEqual(await Promise.all(ids.map(linkOf)), [d.request, d.request, d.request, null]);
  });

  it('cockpit: activity of every phase, newest first, max 5; lastActivityAt = latest event', async () => {
    const d = await dossier();
    for (const [action, module, entityId] of [
      ['REQUEST_SUBMITTED', 'M1', d.request],
      ['PHASE_OPENED', 'M5', d.m5],
      ['INVOICE_UPLOADED', 'M5', d.payment],
      ['PAYMENT_PROOF_UPLOADED', 'M5', d.payment],
      ['MEETING_SCHEDULED', 'M3', d.meeting],
      ['PAYMENT_VALIDATED', 'M5', d.payment],
    ] as Array<[string, string, number]>) {
      await m.auth.logAudit({ userId: d.user, action, module, entityId });
    }
    const cockpit = await m.requests.listRequestCockpit();
    const item = cockpit.items.find((i: { id: number }) => i.id === d.request);
    assert.ok(item);
    assert.equal(item.activity.length, 5);
    assert.equal(item.activity[0].title, 'Paiement validé');
    assert.equal(item.activity.at(-1).title, 'Phase ouverte (M5)');
    // Read as UTC text in SQL: never through the test process's time zone.
    const latest = (
      await one(
        `SELECT to_char(max(created_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at FROM audit_logs WHERE request_id = $1`,
        [d.request]
      )
    ).at;
    assert.equal(item.lastActivityAt, latest);
    assert.equal(item.activity[0].createdAt, latest);
  });

  it('cockpit: a dossier with no linked event falls back to its submission date', async () => {
    const d = await dossier();
    const item = (await m.requests.listRequestCockpit()).items.find(
      (i: { id: number }) => i.id === d.request
    );
    assert.equal(item.lastActivityAt, item.createdAt);
    assert.deepEqual(item.activity, []);
  });

  it('every dossier action has a French activity label', () => {
    return import('./audit-request.js').then(({ AUDIT_ENTITY_BY_ACTION }) => {
      const missing = Object.keys(AUDIT_ENTITY_BY_ACTION).filter(
        (a) => !m.requests.ACTIVITY_LABELS[a]
      );
      assert.deepEqual(missing, []);
    });
  });
});
