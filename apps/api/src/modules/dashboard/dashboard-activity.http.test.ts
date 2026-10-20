/** DASH-DN-UX-1 - GET /api/dashboard/summary: recent activity carries the
 *  real dossier (requestId, DEM reference, link for DN roles), technical
 *  connections never crowd it out, and durations are human-readable.
 *  Audit rows are dated in the future so they are the newest. Needs
 *  DATABASE_URL (migrated, disposable database). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';

process.env.JWT_SECRET ??= 'dash-dn-ux-test-secret';
process.env.JWT_REFRESH_SECRET ??= 'dash-dn-ux-test-refresh-secret';

const DATABASE_URL = process.env.DATABASE_URL;
const dbSkip = DATABASE_URL ? false : 'DATABASE_URL not set';

describe('dashboard summary - recent activity and durations (HTTP)', { skip: dbSkip }, () => {
  let server: Server;
  let baseUrl: string;
  let closeAppPool: () => Promise<void>;
  let pool: pg.Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jwt: Record<string, any>;
  let accessCookieName = '';
  const run = Date.now().toString(36);
  const reference = `DEM-DASH-${run}`;
  const ids = { user: 0, org: 0, applicant: 0, request: 0, phase: 0, payment: 0, audits: [] as number[] };

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
  const audit = async (action: string, entityId: number | null, requestId: number | null, minutesAhead: number) => {
    const { id } = await one(
      `INSERT INTO audit_logs (user_id, action, module, entity_id, request_id, created_at)
       VALUES ($1, $2, 'TEST', $3, $4, now() + interval '1 day' + make_interval(mins => $5)) RETURNING id`,
      [ids.user, action, entityId, requestId, minutesAhead]
    );
    ids.audits.push(id);
  };
  const summaryAs = async (roles: string[]) => {
    const token = jwt.signAccessToken({ kind: 'staff', userId: ids.user, employeeCode: `E${ids.user}`, roles });
    const response = await fetch(`${baseUrl}/api/dashboard/summary`, { headers: { Cookie: `${accessCookieName}=${token}` } });
    assert.equal(response.status, 200);
    return response.json() as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  before(async () => {
    const [{ default: express }, { default: cookieParser }, { default: dashboardRoute }, jwtModule, guards, dbModule] = await Promise.all([
      import('express'),
      import('cookie-parser'),
      import('./dashboard.route.js'),
      import('../../shared/utils/jwt.js'),
      import('../../shared/guards/auth.middleware.js'),
      import('../../shared/db/index.js'),
    ]);
    jwt = jwtModule;
    accessCookieName = guards.ACCESS_TOKEN_COOKIE;
    closeAppPool = () => dbModule.db.$client.end();
    const app = express();
    app.use(cookieParser());
    app.use('/api/dashboard', dashboardRoute);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    pool = new pg.Pool({ connectionString: DATABASE_URL });
    ids.user = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent Finance', $2) RETURNING id`, [`DS${run}`.slice(0, 20), `dash-${run}@test.local`])).id;
    ids.org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA Dash ${run}`])).id;
    ids.applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`, [ids.org, `dash-a-${run}@test.local`])).id;
    ids.request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', 'in_progress') RETURNING id`,
      [reference, ids.applicant, ids.org]
    )).id;
    ids.phase = (await one(`INSERT INTO phases (request_id, phase_code) VALUES ($1, 'M5') RETURNING id`, [ids.request])).id;
    ids.payment = (await one(`INSERT INTO payments (phase_id, status) VALUES ($1, 'validated') RETURNING id`, [ids.phase])).id;

    // Oldest to newest: an unresolvable account event, a phase event linked
    // by audit_logs.request_id, a legacy payment event (request_id NULL,
    // resolved through payment -> phase -> request), then 12 connections.
    await audit('USER_CREATED', ids.user, null, 0);
    await audit('PHASE_CLOSED', ids.phase, ids.request, 1);
    await audit('PAYMENT_VALIDATED', ids.payment, null, 2);
    for (let i = 0; i < 12; i += 1) await audit(['LOGIN', 'AUTH_REFRESH', 'LOGOUT'][i % 3], null, null, 10 + i);
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    if (pool) {
      await pool.query('DELETE FROM audit_logs WHERE id = ANY($1) OR user_id = $2', [ids.audits, ids.user]);
      await pool.query('DELETE FROM payments WHERE id = $1', [ids.payment]);
      await pool.query('DELETE FROM phases WHERE id = $1', [ids.phase]);
      await pool.query('DELETE FROM requests WHERE id = $1', [ids.request]);
      await pool.query('DELETE FROM applicants WHERE id = $1', [ids.applicant]);
      await pool.query('DELETE FROM organisations WHERE id = $1', [ids.org]);
      await pool.query('DELETE FROM users WHERE id = $1', [ids.user]);
      await pool.end();
    }
    await closeAppPool();
  });

  it('DN role: 3 business events despite 12 newer connections, each with its dossier and link', async () => {
    const body = await summaryAs(['dn_agent']);
    assert.deepEqual(
      body.activity.map((item: Record<string, unknown>) => [item.title, item.requestId, item.requestReference, item.href, item.actor]),
      [
        ['Paiement validé', ids.request, reference, `/demandes?id=${ids.request}`, 'Agent Finance'],
        ['Phase clôturée', ids.request, reference, `/demandes?id=${ids.request}`, 'Agent Finance'],
        ['user created', null, null, undefined, 'Agent Finance'],
      ]
    );
    assert.doesNotMatch(JSON.stringify(body.activity), new RegExp(`#(${ids.payment}|${ids.phase}|${ids.user})\\b`));
  });

  it('a role without access to /demandes sees the reference but no link', async () => {
    const body = await summaryAs(['reception']);
    assert.equal(body.activity[0].requestReference, reference);
    assert.equal(body.activity[0].href, undefined);
  });

  it('durations: global duration as « j h » with its raw value; phase SLA target wording; no decimal days', async () => {
    const body = await summaryAs(['SU']);
    const metric = body.metrics.find((item: { key: string }) => item.key === 'average_global_duration');
    assert.equal(metric.unit, 'calendar_days');
    assert.ok(metric.rawValue === null || typeof metric.rawValue === 'number');
    assert.doesNotMatch(String(metric.value), /\d\.\d/);
    assert.equal(metric.periodLabel, 'Historique des retraits');
    // ANALYTICS-SAMPLE-CLARITY-2 - the average names its sample; direct counts carry none.
    const size = metric.sampleSize as number;
    assert.equal(metric.sampleLabel, `${size} ${size > 1 ? 'dossiers avec certificat retiré' : 'dossier avec certificat retiré'}`);
    for (const key of ['active_requests', 'open_phases', 'pending_dg_mail', 'pending_payments']) {
      const direct = body.metrics.find((item: { key: string }) => item.key === key);
      assert.equal(direct.sampleSize, undefined, key);
      assert.equal(direct.sampleLabel, undefined, key);
    }
    for (const phase of body.workflow) {
      assert.match(phase.slaTargetLabel, /^Cible SLA : \d+ jours calendaires$/);
      assert.doesNotMatch(JSON.stringify(phase), /Cible de suivi/);
    }
    for (const action of body.actions) {
      assert.doesNotMatch(`${action.waitingLabel ?? ''} ${action.slaLabel ?? ''}`, /\d\.\d j\b/);
    }
  });
});
