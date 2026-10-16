/** SESSION1-ACCOUNT-1 - PATCH /api/account-requests/applicants/:id over real
 *  HTTP (router behind cookie-parser, as in server.ts). Auth cases need no
 *  database; the rest need DATABASE_URL (migrated, disposable database). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';

process.env.JWT_SECRET ??= 'account1-http-test-secret';

const DATABASE_URL = process.env.DATABASE_URL;
const dbSkip = DATABASE_URL ? false : 'DATABASE_URL not set';

describe('PATCH /api/account-requests/applicants/:id (HTTP)', () => {
  let server: Server;
  let baseUrl: string;
  let closeAppPool: () => Promise<void>;
  let cookieFor: (userId: number, role: string) => string;
  let pool: pg.Pool | undefined;
  const tag = Date.now().toString(36);
  let orgId = 0;
  let applicantId = 0;
  const staffIds: number[] = [];
  const staff: Record<string, number> = {};
  const emailOf = (k: string) => `h-${k}-${tag}@test.local`;
  const OTHER_EMAIL = `h-other-${tag}@test.local`;
  let otherId = 0;
  const HASH = 'known-hash-value';

  before(async () => {
    const [{ default: express }, { default: cookieParser }, { default: route }, jwt, guards, dbModule] =
      await Promise.all([
        import('express'),
        import('cookie-parser'),
        import('./account-requests.route.js'),
        import('../../shared/utils/jwt.js'),
        import('../../shared/guards/auth.middleware.js'),
        import('../../shared/db/index.js'),
      ]);
    closeAppPool = () => dbModule.db.$client.end();
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/account-requests', route);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    cookieFor = (userId, role) =>
      `${guards.ACCESS_TOKEN_COOKIE}=${jwt.signAccessToken({
        kind: 'staff',
        userId,
        employeeCode: `E${userId}`,
        roles: [role],
      })}`;

    if (!DATABASE_URL) return;
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const one = async (sql: string, params: unknown[] = []) => (await pool!.query(sql, params)).rows[0];
    orgId = (
      await one(
        `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
        [`OMA HTTP ${tag}`]
      )
    ).id;
    applicantId = (
      await one(
        `INSERT INTO applicants (organisation_id, full_name, email, phone, password_hash) VALUES ($1,'Alice',$2,'0102',$3) RETURNING id`,
        [orgId, emailOf('a'), HASH]
      )
    ).id;
    otherId = (
      await one(
        `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1,'Bob',$2,$3) RETURNING id`,
        [orgId, OTHER_EMAIL, HASH]
      )
    ).id;
    for (const role of ['dn_agent', 'dn_supervisor', 'SU', 'reception']) {
      const id = (
        await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, $2, $3) RETURNING id`, [
          `H${staffIds.length}${tag}`.slice(0, 20),
          `Staff ${role}`,
          `staff-${role}-${tag}@test.local`,
        ])
      ).id;
      staff[role] = id;
      staffIds.push(id);
    }
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    if (pool) {
      await pool.query(`DELETE FROM audit_logs WHERE module='M13' AND entity_id IN ($1,$2)`, [applicantId, otherId]);
      await pool.query('DELETE FROM applicants WHERE id IN ($1,$2)', [applicantId, otherId]);
      await pool.query('DELETE FROM organisations WHERE id = $1', [orgId]);
      await pool.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [staffIds]);
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [staffIds]);
      await pool.end();
    }
    await closeAppPool();
  });

  const patch = (id: number | string, body: unknown, cookie?: string) =>
    fetch(`${baseUrl}/api/account-requests/applicants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });

  const stored = async () =>
    (await pool!.query('SELECT * FROM applicants WHERE id = $1', [applicantId])).rows[0] as {
      organisation_id: number;
      full_name: string;
      email: string;
      phone: string | null;
      contact_order: string;
      active: boolean;
      password_hash: string;
    };

  it('without a cookie: 401', async () => {
    const response = await patch(1, { fullName: 'X' });
    assert.equal(response.status, 401);
  });

  it('role reception: 403', async () => {
    const response = await patch(1, { fullName: 'X' }, cookieFor(1, 'reception'));
    assert.equal(response.status, 403);
  });

  for (const role of ['dn_agent', 'dn_supervisor', 'SU']) {
    it(`${role}: 200 with the updated view`, { skip: dbSkip }, async () => {
      const name = `Alice ${role}`;
      const response = await patch(applicantId, { fullName: name }, cookieFor(staff[role], role));
      assert.equal(response.status, 200);
      const body = (await response.json()) as { id: number; fullName: string; organisationName: string };
      assert.equal(body.id, applicantId);
      assert.equal(body.fullName, name);
      assert.equal(body.organisationName, `OMA HTTP ${tag}`);
    });
  }

  it('whitelist: organisationId, password, passwordHash, active are ignored', { skip: dbSkip }, async () => {
    const response = await patch(
      applicantId,
      { fullName: 'Whitelisted', organisationId: 1, password: 'hacked123', passwordHash: 'evil', active: false },
      cookieFor(staff.dn_agent, 'dn_agent')
    );
    assert.equal(response.status, 200);
    const row = await stored();
    assert.equal(row.full_name, 'Whitelisted');
    assert.equal(row.organisation_id, orgId);
    assert.equal(row.password_hash, HASH);
    assert.equal(row.active, true);
  });

  it('duplicate email: 409 with the French message', { skip: dbSkip }, async () => {
    const response = await patch(applicantId, { email: OTHER_EMAIL.toUpperCase() }, cookieFor(staff.dn_agent, 'dn_agent'));
    assert.equal(response.status, 409);
    const body = (await response.json()) as { message: string };
    assert.equal(body.message, 'Un compte postulant existe déjà pour cet email.');
    assert.equal((await stored()).email, emailOf('a'));
  });

  it('validation errors: 400', { skip: dbSkip }, async () => {
    const cookie = cookieFor(staff.dn_agent, 'dn_agent');
    const email = await patch(applicantId, { email: 'not-an-email' }, cookie);
    assert.equal(email.status, 400);
    assert.equal(((await email.json()) as { message: string }).message, 'Adresse email invalide.');
    const typed = await patch(applicantId, { email: 42 }, cookie);
    assert.equal(typed.status, 400);
    assert.equal(((await typed.json()) as { message: string }).message, 'Adresse email invalide.');
    const name = await patch(applicantId, { fullName: '   ' }, cookie);
    assert.equal(name.status, 400);
    assert.equal(((await name.json()) as { message: string }).message, 'Le nom complet est requis.');
    const order = await patch(applicantId, { contactOrder: 'owner' }, cookie);
    assert.equal(order.status, 400);
    assert.equal(((await order.json()) as { message: string }).message, 'Ordre de contact invalide.');
  });

  it('unknown applicant: 404', { skip: dbSkip }, async () => {
    const response = await patch(999999999, { fullName: 'X' }, cookieFor(staff.dn_agent, 'dn_agent'));
    assert.equal(response.status, 404);
  });

  it('id beyond int4 or not a positive integer: 404', { skip: dbSkip }, async () => {
    const cookie = cookieFor(staff.dn_agent, 'dn_agent');
    for (const id of [3000000000, 2147483648, 0, -1, 'abc']) {
      const response = await patch(id, { fullName: 'X' }, cookie);
      assert.equal(response.status, 404, String(id));
    }
  });
});
