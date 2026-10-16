/** SESSION1-COCKPIT-1 B4 - PATCH /api/site-inspection/site-visits/:id/held over
 *  real HTTP: the router behind cookie-parser, as in server.ts (needs
 *  DATABASE_URL, a migrated, disposable database). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';

process.env.JWT_SECRET ??= 'cockpit1-http-test-secret';
const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('PATCH /api/site-inspection/site-visits/:id/held (HTTP)', { skip }, () => {
  let server: Server;
  let baseUrl: string;
  let pool: pg.Pool;
  let cookieFor: (userId: number, roles: string[]) => string;
  let closeAppPool: () => Promise<void>;
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const [{ default: express }, { default: cookieParser }, { default: route }, jwt, guards, dbModule] = await Promise.all([
      import('express'),
      import('cookie-parser'),
      import('./site-inspection.route.js'),
      import('../../shared/utils/jwt.js'),
      import('../../shared/guards/auth.middleware.js'),
      import('../../shared/db/index.js'),
    ]);
    closeAppPool = () => dbModule.db.$client.end();
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/site-inspection', route);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    cookieFor = (userId, roles) =>
      `${guards.ACCESS_TOKEN_COOKIE}=${jwt.signAccessToken({ kind: 'staff', userId, employeeCode: 'T', roles })}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  async function seed(paymentStatus: string, visitStatus: string) {
    const k = `${tag}-${++n}`;
    const agent = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent CI', $2) RETURNING id`, [`SHH${k}`, `shh-${k}@test.local`])).id as number;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA SHH ${k}`])).id as number;
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`, [org, `shh-a-${k}@test.local`])).id as number;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', 'in_progress') RETURNING id`,
      [`DEM-SHH-${k}`, applicant, org]
    )).id as number;
    const phase = (await one(`INSERT INTO phases (request_id, phase_code, status) VALUES ($1, 'M6', 'open') RETURNING id`, [request])).id as number;
    await pool.query(`INSERT INTO payments (phase_id, status) VALUES ($1, $2)`, [phase, paymentStatus]);
    const visit = (await one(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status)
       VALUES ($1, 'site_visit', $2, now() + interval '1 day', $3, 'not_required') RETURNING id`,
      [phase, agent, visitStatus]
    )).id as number;
    return { agent, visit };
  }

  const patch = (visit: number, cookie: string) =>
    fetch(`${baseUrl}/api/site-inspection/site-visits/${visit}/held`, { method: 'PATCH', headers: { Cookie: cookie } });

  it('unpaid visit, as its agent: 409 SITE_VISIT_PAYMENT_NOT_VALIDATED with the Finance message', async () => {
    const { agent, visit } = await seed('awaiting_proof', 'scheduled');
    const response = await patch(visit, cookieFor(agent, ['r3_agent']));
    assert.equal(response.status, 409);
    const body = (await response.json()) as { code: string; message: string };
    assert.equal(body.code, 'SITE_VISIT_PAYMENT_NOT_VALIDATED');
    assert.equal(body.message, "Le paiement doit être validé par Finance avant d'enregistrer la tenue de la visite.");
  });

  it('already held visit: 409 MEETING_NOT_SCHEDULED (no longer 500)', async () => {
    const { agent, visit } = await seed('validated', 'held');
    const response = await patch(visit, cookieFor(agent, ['r3_agent']));
    assert.equal(response.status, 409);
    assert.equal(((await response.json()) as { code: string }).code, 'MEETING_NOT_SCHEDULED');
  });

  it('dn_agent: 403', async () => {
    const { agent, visit } = await seed('validated', 'scheduled');
    assert.equal((await patch(visit, cookieFor(agent, ['dn_agent']))).status, 403);
  });
});
