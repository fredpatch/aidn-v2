/** AUTH-LOGIN-NORMALIZE-1 - applicant login matches the stored (normalised)
 *  email whatever the casing or surrounding spaces typed; the password is
 *  compared as typed; failures keep their existing responses; the session
 *  identity is the stored row, not the raw input. Needs DATABASE_URL
 *  (migrated, disposable database). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET ??= 'login-normalize-test-secret';
process.env.JWT_REFRESH_SECRET ??= 'login-normalize-test-refresh-secret';

const DATABASE_URL = process.env.DATABASE_URL;
const dbSkip = DATABASE_URL ? false : 'DATABASE_URL not set';
const PASSWORD = 'Passw0rd!';

describe('applicant login email normalisation (HTTP)', { skip: dbSkip }, () => {
  let server: Server;
  let baseUrl: string;
  let closeAppPool: () => Promise<void>;
  let pool: pg.Pool;
  let accessName = '';
  const run = Date.now().toString(36);
  const email = `user.name-${run}@example.com`;
  const inactiveEmail = `inactive-${run}@example.com`;
  let orgId = 0;
  const applicantIds: number[] = [];

  const login = (typed: string, password = PASSWORD) =>
    fetch(`${baseUrl}/api/applicant-auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: typed, password }),
    });
  const accessCookie = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .find((pair) => pair.startsWith(`${accessName}=`));

  before(async () => {
    const [{ default: express }, { default: cookieParser }, { default: authRoute }, guards, dbModule] = await Promise.all([
      import('express'),
      import('cookie-parser'),
      import('./applicant-auth.route.js'),
      import('../../shared/guards/auth.middleware.js'),
      import('../../shared/db/index.js'),
    ]);
    closeAppPool = () => dbModule.db.$client.end();
    accessName = guards.APPLICANT_ACCESS_TOKEN_COOKIE;
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/applicant-auth', authRoute);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    pool = new pg.Pool({ connectionString: DATABASE_URL });
    orgId = (
      await pool.query(
        `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
        [`OMA Login ${run}`]
      )
    ).rows[0].id;
    const hash = await bcrypt.hash(PASSWORD, 10);
    for (const [address, active] of [[email, true], [inactiveEmail, false]] as const) {
      const { rows } = await pool.query(
        `INSERT INTO applicants (organisation_id, full_name, email, password_hash, active) VALUES ($1, 'Postulant', $2, $3, $4) RETURNING id`,
        [orgId, address, hash, active]
      );
      applicantIds.push(rows[0].id);
    }
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    if (pool) {
      await pool.query(`DELETE FROM audit_logs WHERE module = 'M13' AND entity_id = ANY($1)`, [applicantIds]);
      await pool.query('DELETE FROM applicants WHERE id = ANY($1)', [applicantIds]);
      await pool.query('DELETE FROM organisations WHERE id = $1', [orgId]);
      await pool.end();
    }
    await closeAppPool();
  });

  const variants: Array<[string, string]> = [
    ['exact canonical email', email],
    ['uppercase', email.toUpperCase()],
    ['mixed case', `User.Name-${run}@Example.Com`],
    ['leading / trailing spaces', `  ${email}  `],
    ['spaces and mixed casing', `  User.Name-${run}@Example.COM `],
  ];
  for (const [label, typed] of variants) {
    it(`${label}: 200`, async () => {
      const response = await login(typed);
      assert.equal(response.status, 200, JSON.stringify(typed));
      const body = (await response.json()) as { applicant: { id: number; email: string } };
      assert.equal(body.applicant.id, applicantIds[0]);
      assert.equal(body.applicant.email, email);
    });
  }

  it('/me after a mixed-case login serves the canonical stored email', async () => {
    const response = await login(`  USER.Name-${run}@EXAMPLE.com`);
    const cookie = accessCookie(response);
    assert.ok(cookie);
    const me = await fetch(`${baseUrl}/api/applicant-auth/me`, { headers: { Cookie: cookie } });
    assert.equal(me.status, 200);
    const body = (await me.json()) as { id: number; email: string };
    assert.equal(body.id, applicantIds[0]);
    assert.equal(body.email, email);
  });

  it('unknown email: existing 401 « Compte introuvable ou inactif. », no cookie', async () => {
    const response = await login(`other-${run}@example.com`);
    assert.equal(response.status, 401);
    assert.equal(((await response.json()) as { message: string }).message, 'Compte introuvable ou inactif.');
    assert.equal(accessCookie(response), undefined);
  });

  it('normalised email + wrong password: existing 401, no cookie', async () => {
    const response = await login(email.toUpperCase(), 'wrong-password');
    assert.equal(response.status, 401);
    assert.equal(((await response.json()) as { message: string }).message, 'Mot de passe invalide.');
    assert.equal(accessCookie(response), undefined);
  });

  it('the password is not transformed: spaces or other casing around it fail', async () => {
    for (const password of [` ${PASSWORD} `, PASSWORD.toLowerCase(), PASSWORD.toUpperCase()]) {
      const response = await login(email, password);
      assert.equal(response.status, 401, JSON.stringify(password));
    }
  });

  it('inactive account: uppercase email gets the existing inactive response, no cookie', async () => {
    for (const typed of [inactiveEmail, `  ${inactiveEmail.toUpperCase()} `]) {
      const response = await login(typed);
      assert.equal(response.status, 401);
      assert.equal(((await response.json()) as { message: string }).message, 'Compte introuvable ou inactif.');
      assert.equal(accessCookie(response), undefined);
    }
  });
});
