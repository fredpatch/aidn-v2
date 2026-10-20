/** SESSION1-ACCOUNT-1 - regression: what happens to an applicant's live session
 *  when staff change its email. The JWT carries the old email, but identity is
 *  the applicant id: /me and /refresh must serve the new email without a
 *  re-login. Needs DATABASE_URL (migrated, disposable database). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';

process.env.JWT_SECRET ??= 'account1-session-test-secret';
process.env.JWT_REFRESH_SECRET ??= 'account1-session-test-refresh-secret';

const DATABASE_URL = process.env.DATABASE_URL;
const dbSkip = DATABASE_URL ? false : 'DATABASE_URL not set';
const PASSWORD = 'Passw0rd!';

describe('applicant session across a staff email change (HTTP)', { skip: dbSkip }, () => {
  let server: Server;
  let baseUrl: string;
  let closeAppPool: () => Promise<void>;
  let pool: pg.Pool;
  let staffCookie = '';
  let accessName = '';
  let refreshName = '';
  const run = Date.now().toString(36);
  const oldEmail = `old-${run}@test.local`;
  const typedNewEmail = `New-${run}@Test.local`;
  const newEmail = typedNewEmail.trim().toLowerCase();
  let orgId = 0;
  let applicantId = 0;
  let staffId = 0;

  const cookiesOf = (response: Response) => {
    const jar: Record<string, string> = {};
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      jar[pair.slice(0, index).trim()] = pair.slice(index + 1);
    }
    return jar;
  };
  const decode = (token: string) =>
    jsonwebtoken.decode(token) as { email: string; applicantId: number; kind: string };
  const login = (email: string, password = PASSWORD) =>
    fetch(`${baseUrl}/api/applicant-auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

  let accessToken = '';
  let refreshToken = '';

  before(async () => {
    const [{ default: express }, { default: cookieParser }, { default: authRoute }, { default: requestsRoute }, jwt, guards, dbModule] =
      await Promise.all([
        import('express'),
        import('cookie-parser'),
        import('../applicant-auth/applicant-auth.route.js'),
        import('./account-requests.route.js'),
        import('../../shared/utils/jwt.js'),
        import('../../shared/guards/auth.middleware.js'),
        import('../../shared/db/index.js'),
      ]);
    closeAppPool = () => dbModule.db.$client.end();
    accessName = guards.APPLICANT_ACCESS_TOKEN_COOKIE;
    refreshName = guards.APPLICANT_REFRESH_TOKEN_COOKIE;
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/applicant-auth', authRoute);
    app.use('/api/account-requests', requestsRoute);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
    orgId = (
      await one(
        `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
        [`OMA Session ${run}`]
      )
    ).id;
    applicantId = (
      await one(
        `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1,'Alice',$2,$3) RETURNING id`,
        [orgId, oldEmail, await bcrypt.hash(PASSWORD, 10)]
      )
    ).id;
    staffId = (
      await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Staff agent', $2) RETURNING id`, [
        `S${run}`.slice(0, 20),
        newEmail,
      ])
    ).id;
    staffCookie = `${guards.ACCESS_TOKEN_COOKIE}=${jwt.signAccessToken({
      kind: 'staff',
      userId: staffId,
      employeeCode: `E${staffId}`,
      roles: ['dn_agent'],
    })}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    if (pool) {
      await pool.query(`DELETE FROM audit_logs WHERE module='M13' AND entity_id = $1`, [applicantId]);
      await pool.query('DELETE FROM applicants WHERE id = $1', [applicantId]);
      await pool.query('DELETE FROM organisations WHERE id = $1', [orgId]);
      await pool.query('DELETE FROM audit_logs WHERE user_id = $1', [staffId]);
      await pool.query('DELETE FROM users WHERE id = $1', [staffId]);
      await pool.end();
    }
    await closeAppPool();
  });

  it('login with the old email yields tokens carrying the old email', async () => {
    const response = await login(oldEmail);
    assert.equal(response.status, 200);
    const jar = cookiesOf(response);
    accessToken = jar[accessName];
    refreshToken = jar[refreshName];
    assert.ok(accessToken && refreshToken);
    assert.equal(decode(accessToken).email, oldEmail);
  });

  it('staff PATCH of the email: 200, stored normalised', async () => {
    const response = await fetch(`${baseUrl}/api/account-requests/applicants/${applicantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: staffCookie },
      body: JSON.stringify({ email: typedNewEmail }),
    });
    assert.equal(response.status, 200);
    const row = (await pool.query('SELECT email FROM applicants WHERE id = $1', [applicantId])).rows[0];
    assert.equal(row.email, newEmail);
  });

  it('the original access cookie still works: /me serves the new email, same id', async () => {
    const response = await fetch(`${baseUrl}/api/applicant-auth/me`, {
      headers: { Cookie: `${accessName}=${accessToken}` },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { id: number; email: string };
    assert.equal(body.id, applicantId);
    assert.equal(body.email, newEmail);
  });

  it('the original refresh cookie mints an access token with the new email', async () => {
    const response = await fetch(`${baseUrl}/api/applicant-auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `${refreshName}=${refreshToken}` },
    });
    assert.equal(response.status, 200);
    const fresh = cookiesOf(response)[accessName];
    assert.ok(fresh);
    const payload = decode(fresh);
    assert.equal(payload.email, newEmail);
    assert.equal(payload.applicantId, applicantId);
  });

  it('old email can no longer log in (401); new email + same password can', async () => {
    const stale = await login(oldEmail);
    assert.equal(stale.status, 401);
    assert.equal(((await stale.json()) as { message: string }).message, 'Identifiants invalides.');
    const fresh = await login(newEmail);
    assert.equal(fresh.status, 200);
    const payload = decode(cookiesOf(fresh)[accessName]);
    assert.equal(payload.email, newEmail);
    assert.equal(payload.applicantId, applicantId);
    assert.equal(payload.kind, 'applicant');
  });

  it('AUTH-LOGIN-NORMALIZE-1: normalisation never revives the old email; the new one works in any casing', async () => {
    for (const typed of [oldEmail.toUpperCase(), `  ${oldEmail} `]) {
      const stale = await login(typed);
      assert.equal(stale.status, 401, typed);
      assert.equal(((await stale.json()) as { message: string }).message, 'Identifiants invalides.');
    }
    const fresh = await login(` ${newEmail.toUpperCase()} `);
    assert.equal(fresh.status, 200);
    const payload = decode(cookiesOf(fresh)[accessName]);
    assert.equal(payload.email, newEmail, 'token carries the stored email, not the typed one');
    assert.equal(payload.applicantId, applicantId);
  });
});
