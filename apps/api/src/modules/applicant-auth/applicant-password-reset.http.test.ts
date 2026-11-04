/** ACCOUNT-V2 - rejected account requests, admin password reset, session
 *  invalidation (credential version) and the forced password change, over
 *  real HTTP: the routers behind cookie-parser, as in server.ts. Needs
 *  DATABASE_URL (migrated, disposable database). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';

process.env.JWT_SECRET ??= 'account-v2-test-secret';
process.env.JWT_REFRESH_SECRET ??= 'account-v2-test-refresh-secret';

const DATABASE_URL = process.env.DATABASE_URL;
const dbSkip = DATABASE_URL ? false : 'DATABASE_URL not set';
const PASSWORD = 'Passw0rd!';
const NEW_PASSWORD = 'Nouveau-mot-2026';

type Json = Record<string, unknown>;

describe('ACCOUNT-V2 - rejected requests, password reset and sessions (HTTP)', { skip: dbSkip }, () => {
  let server: Server;
  let baseUrl: string;
  let closeAppPool: () => Promise<void>;
  let pool: pg.Pool;
  let jwt: typeof import('../../shared/utils/jwt.js');
  let accessName = '';
  let refreshName = '';
  let staffCookieName = '';
  const run = Date.now().toString(36);
  const startedAt = new Date();
  let orgId = 0;
  let applicantId = 0;
  let suspendedId = 0;
  const staffIds: number[] = [];
  const requestIds: number[] = [];
  let supervisorId = 0;
  let suId = 0;
  let pendingId = 0;
  let rejectedId = 0;
  const email = `reset-${run}@test.local`;

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
  const cookiesOf = (response: Response) => {
    const jar: Record<string, string> = {};
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      jar[pair.slice(0, index).trim()] = pair.slice(index + 1);
    }
    return jar;
  };
  const staffCookie = (userId: number, roles: string[]) =>
    `${staffCookieName}=${jwt.signAccessToken({ kind: 'staff', userId, employeeCode: `E${userId}`, roles })}`;
  const call = (path: string, init: { method?: string; cookie?: string; body?: unknown } = {}) =>
    fetch(`${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(init.cookie ? { Cookie: init.cookie } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  const login = (password: string) => call('/api/applicant-auth/login', { method: 'POST', body: { email, password } });
  const reset = (id: number, cookie: string) =>
    call(`/api/account-requests/applicants/${id}/reset-password`, { method: 'POST', cookie });
  const access = (token: string) => `${accessName}=${token}`;
  const applicantRow = () =>
    one('SELECT password_hash, auth_version, must_change_password, active FROM applicants WHERE id = $1', [applicantId]);
  /** A business route (authenticateApplicant), a shared route
   *  (authenticateEither, unknown app) and file delivery (own token check). */
  const businessStatus = async (cookie: string) => ({
    mine: (await call('/api/requests/mine', { cookie })).status,
    either: (await call('/api/requests', { method: 'POST', cookie, body: {} })).status,
    file: (await call('/api/files/2000000000/access', { method: 'POST', cookie, body: {} })).status,
  });

  before(async () => {
    const [
      { default: express },
      { default: cookieParser },
      { default: authRoute },
      { default: accountRoute },
      { default: requestsRoute },
      { default: filesRoute },
      jwtModule,
      guards,
      dbModule,
    ] = await Promise.all([
      import('express'),
      import('cookie-parser'),
      import('./applicant-auth.route.js'),
      import('../account-requests/account-requests.route.js'),
      import('../requests/requests.route.js'),
      import('../files/files.route.js'),
      import('../../shared/utils/jwt.js'),
      import('../../shared/guards/auth.middleware.js'),
      import('../../shared/db/index.js'),
    ]);
    jwt = jwtModule;
    closeAppPool = () => dbModule.db.$client.end();
    accessName = guards.APPLICANT_ACCESS_TOKEN_COOKIE;
    refreshName = guards.APPLICANT_REFRESH_TOKEN_COOKIE;
    staffCookieName = guards.ACCESS_TOKEN_COOKIE;
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/applicant-auth', authRoute);
    app.use('/api/account-requests', accountRoute);
    app.use('/api/requests', requestsRoute);
    app.use('/api/files', filesRoute);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    pool = new pg.Pool({ connectionString: DATABASE_URL });
    orgId = (
      await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [
        `OMA Reset ${run}`,
      ])
    ).id;
    const hash = await bcrypt.hash(PASSWORD, 10);
    applicantId = (
      await one(
        `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1,'Alice',$2,$3) RETURNING id`,
        [orgId, email, hash]
      )
    ).id;
    suspendedId = (
      await one(
        `INSERT INTO applicants (organisation_id, full_name, email, password_hash, active) VALUES ($1,'Bob',$2,$3,false) RETURNING id`,
        [orgId, `suspended-${run}@test.local`, hash]
      )
    ).id;
    for (const label of ['supervisor', 'su']) {
      staffIds.push(
        (
          await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, $2, $3) RETURNING id`, [
            `${label}${run}`.slice(0, 20),
            `Staff ${label}`,
            `${label}-${run}@test.local`,
          ])
        ).id
      );
    }
    [supervisorId, suId] = staffIds;

    const request = (contact: string, status: 'pending' | 'rejected', reason: string | null) =>
      one(
        `INSERT INTO account_requests (organisation_name_input, legal_address, requested_email, contact_full_name,
           contact_email, password_hash, form_started_at, status, rejection_reason, reviewed_by, reviewed_at)
         VALUES ($1, 'Libreville', $2, $3, $2, 'x', now(), $4, $5, $6, $7) RETURNING id`,
        [
          `Aéro ${status} ${run}`,
          `${contact}-${run}@test.local`,
          `Contact ${status}`,
          status,
          reason,
          status === 'rejected' ? supervisorId : null,
          status === 'rejected' ? new Date() : null,
        ]
      );
    pendingId = (await request('pending', 'pending', null)).id;
    rejectedId = (await request('rejected', 'rejected', `Organisme inconnu ${run}`)).id;
    requestIds.push(pendingId, rejectedId);
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    if (pool) {
      const applicantIds = [applicantId, suspendedId];
      await pool.query(`DELETE FROM audit_logs WHERE applicant_id = ANY($1) OR user_id = ANY($2)`, [applicantIds, staffIds]);
      await pool.query(`DELETE FROM audit_logs WHERE module = 'M13' AND entity_id = ANY($1)`, [[...applicantIds, ...requestIds]]);
      await pool.query('DELETE FROM account_requests WHERE id = ANY($1)', [requestIds]);
      await pool.query('DELETE FROM applicants WHERE id = ANY($1)', [applicantIds]);
      await pool.query('DELETE FROM organisations WHERE id = $1', [orgId]);
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [staffIds]);
      await pool.end();
    }
    await closeAppPool();
  });

  describe('rejected account requests', () => {
    const list = async (query: string) => {
      const response = await call(`/api/account-requests${query}`, { cookie: staffCookie(supervisorId, ['dn_agent']) });
      return { status: response.status, body: (await response.json()) as Json[] | Json };
    };

    it('status=rejected returns only rejected requests, with reason, decision date and reviewer', async () => {
      const { status, body } = await list('?status=rejected');
      assert.equal(status, 200);
      const rows = body as Json[];
      assert.ok(rows.every((row) => row.status === 'rejected'));
      const mine = rows.find((row) => row.id === rejectedId);
      assert.ok(mine, 'the rejected request is listed');
      assert.equal(mine.rejectionReason, `Organisme inconnu ${run}`);
      assert.equal(mine.reviewedBy, supervisorId);
      assert.ok(mine.reviewedAt);
      assert.deepEqual(mine.candidates, [], 'history: no organisation matching');
      assert.ok(!rows.some((row) => row.id === pendingId));
    });

    it('pending (explicit or default) is unchanged: pending only, candidates computed', async () => {
      for (const query of ['?status=pending', '']) {
        const { status, body } = await list(query);
        assert.equal(status, 200);
        const rows = body as Json[];
        assert.ok(rows.every((row) => row.status === 'pending'), query);
        assert.ok(rows.some((row) => row.id === pendingId), query);
        assert.ok(!rows.some((row) => row.id === rejectedId), query);
        assert.ok(Array.isArray(rows.find((row) => row.id === pendingId)!.candidates));
      }
    });

    it('an unknown status is refused (400), never cast into the query', async () => {
      for (const query of ['?status=bogus', '?status=pending&status=rejected', "?status=pending'--"]) {
        const { status, body } = await list(query);
        assert.equal(status, 400, query);
        assert.equal((body as Json).code, 'INVALID_ACCOUNT_REQUEST_STATUS');
      }
      assert.equal((await list('?status=approved')).status, 200);
    });
  });

  describe('reset RBAC and refusals', () => {
    it('only dn_supervisor and SU reach the reset: other staff get 403 and nothing changes', async () => {
      const before = await applicantRow();
      for (const role of ['dn_agent', 'reception', 'assistant_dg', 'assistant_dn', 's5_agent', 'finance']) {
        const response = await reset(applicantId, staffCookie(supervisorId, [role]));
        assert.equal(response.status, 403, role);
      }
      assert.equal((await call(`/api/account-requests/applicants/${applicantId}/reset-password`, { method: 'POST' })).status, 401);
      assert.deepEqual(await applicantRow(), before);
    });

    it('a missing applicant: 404 APPLICANT_NOT_FOUND', async () => {
      for (const id of ['2000000000', '99999999999', 'abc', '0']) {
        const response = await call(`/api/account-requests/applicants/${id}/reset-password`, {
          method: 'POST',
          cookie: staffCookie(supervisorId, ['dn_supervisor']),
        });
        assert.equal(response.status, 404, id);
        assert.equal(((await response.json()) as Json).code, 'APPLICANT_NOT_FOUND');
      }
    });

    it('a suspended account: 409 PASSWORD_RESET_NOT_ALLOWED, nothing changes', async () => {
      const response = await reset(suspendedId, staffCookie(supervisorId, ['dn_supervisor']));
      assert.equal(response.status, 409);
      assert.equal(((await response.json()) as Json).code, 'PASSWORD_RESET_NOT_ALLOWED');
      const row = await one('SELECT auth_version, must_change_password FROM applicants WHERE id = $1', [suspendedId]);
      assert.deepEqual(row, { auth_version: 1, must_change_password: false });
    });
  });

  describe('reset -> forced change -> new session', () => {
    let oldAccess = '';
    let oldRefresh = '';
    let legacyAccess = '';
    let temporaryPassword = '';
    let tempAccess = '';
    let tempRefresh = '';
    let newAccess = '';

    it('login at version 1: the tokens carry authVersion 1; a legacy token (no authVersion) is accepted', async () => {
      const response = await login(PASSWORD);
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as { applicant: Json }).applicant.mustChangePassword, false);
      const jar = cookiesOf(response);
      oldAccess = jar[accessName];
      oldRefresh = jar[refreshName];
      assert.equal((jsonwebtoken.decode(oldAccess) as Json).authVersion, 1);
      assert.equal((jsonwebtoken.decode(oldRefresh) as Json).authVersion, 1);
      assert.equal((await call('/api/requests/mine', { cookie: access(oldAccess) })).status, 200);

      legacyAccess = jsonwebtoken.sign(
        { kind: 'applicant', applicantId, organisationId: orgId, email },
        process.env.JWT_SECRET!,
        { audience: 'aidn-users', expiresIn: '30m' }
      );
      assert.equal((jsonwebtoken.decode(legacyAccess) as Json).authVersion, undefined);
      assert.equal((await call('/api/requests/mine', { cookie: access(legacyAccess) })).status, 200);
      const legacyRefresh = jsonwebtoken.sign(
        { kind: 'applicant', applicantId, organisationId: orgId, email },
        process.env.JWT_REFRESH_SECRET!,
        { audience: 'aidn-users', expiresIn: '7d' }
      );
      const refreshed = await call('/api/applicant-auth/refresh', { method: 'POST', cookie: `${refreshName}=${legacyRefresh}` });
      assert.equal(refreshed.status, 200, 'legacy refresh token at version 1');
      assert.equal((jsonwebtoken.decode(cookiesOf(refreshed)[accessName]) as Json).authVersion, 1);
    });

    it('supervisor reset: one-time temporary password, hash replaced, version +1, change required, audited without secret', async () => {
      const before = await applicantRow();
      const response = await reset(applicantId, staffCookie(supervisorId, ['dn_supervisor']));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = (await response.json()) as { temporaryPassword: string; account: Json };
      temporaryPassword = body.temporaryPassword;
      assert.match(temporaryPassword, /^[A-HJ-NP-Za-km-z2-9]{16}$/);
      assert.equal(body.account.id, applicantId);
      assert.equal(body.account.mustChangePassword, true);
      assert.ok(!('passwordHash' in body.account), 'no hash in the response');

      const row = await applicantRow();
      assert.notEqual(row.password_hash, before.password_hash);
      assert.notEqual(row.password_hash, temporaryPassword, 'never stored in plaintext');
      assert.ok(await bcrypt.compare(temporaryPassword, row.password_hash));
      assert.equal(row.auth_version, before.auth_version + 1);
      assert.equal(row.must_change_password, true);
      const stored = JSON.stringify(await one('SELECT * FROM applicants WHERE id = $1', [applicantId]));
      assert.ok(!stored.includes(temporaryPassword));

      const audits = (
        await pool.query(`SELECT user_id, applicant_id, entity_id, details FROM audit_logs WHERE action = 'APPLICANT_PASSWORD_RESET' AND entity_id = $1`, [
          applicantId,
        ])
      ).rows;
      assert.equal(audits.length, 1);
      assert.equal(audits[0].user_id, supervisorId);
      assert.equal(audits[0].applicant_id, null);
      assert.deepEqual(audits[0].details, { reason: 'admin_reset', sessions_invalidated: true, must_change_password: true });
      const leaked = await one(`SELECT count(*)::int AS n FROM audit_logs WHERE created_at >= $1 AND details::text LIKE $2`, [
        startedAt,
        `%${temporaryPassword}%`,
      ]);
      assert.equal(leaked.n, 0, 'no audit row carries the temporary password');
    });

    it('every token issued before the reset is dead: access (business, shared, files), legacy, refresh', async () => {
      for (const token of [oldAccess, legacyAccess]) {
        assert.deepEqual(await businessStatus(access(token)), { mine: 401, either: 401, file: 401 });
        assert.equal((await call('/api/applicant-auth/me', { cookie: access(token) })).status, 401);
      }
      const refreshed = await call('/api/applicant-auth/refresh', { method: 'POST', cookie: `${refreshName}=${oldRefresh}` });
      assert.equal(refreshed.status, 401);
      assert.equal(((await refreshed.json()) as Json).code, 'SESSION_REVOKED');
    });

    it('the old password no longer logs in; the temporary one does, with the change required', async () => {
      const stale = await login(PASSWORD);
      assert.equal(stale.status, 401);
      assert.equal(((await stale.json()) as Json).code, 'INVALID_CREDENTIALS');

      const response = await login(temporaryPassword);
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as { applicant: Json }).applicant.mustChangePassword, true);
      const jar = cookiesOf(response);
      tempAccess = jar[accessName];
      tempRefresh = jar[refreshName];
      assert.equal((jsonwebtoken.decode(tempAccess) as Json).authVersion, 2);
    });

    it('with the temporary password, only /me, refresh and the change are open (403 PASSWORD_CHANGE_REQUIRED)', async () => {
      const me = await call('/api/applicant-auth/me', { cookie: access(tempAccess) });
      assert.equal(me.status, 200);
      assert.equal(((await me.json()) as Json).mustChangePassword, true);
      assert.deepEqual(await businessStatus(access(tempAccess)), { mine: 403, either: 403, file: 403 });
      const blocked = await call('/api/requests/mine', { cookie: access(tempAccess) });
      assert.equal(((await blocked.json()) as Json).code, 'PASSWORD_CHANGE_REQUIRED');
      const refreshed = await call('/api/applicant-auth/refresh', { method: 'POST', cookie: `${refreshName}=${tempRefresh}` });
      assert.equal(refreshed.status, 200, 'the change screen survives the access-token expiry');
    });

    it('the change refuses a wrong current password, a short or unchanged new one - and changes nothing', async () => {
      const before = await applicantRow();
      const cases: Array<[Json, string]> = [
        [{ currentPassword: 'wrong-password', newPassword: NEW_PASSWORD }, 'INVALID_CURRENT_PASSWORD'],
        [{ newPassword: NEW_PASSWORD }, 'INVALID_CURRENT_PASSWORD'],
        [{ currentPassword: temporaryPassword, newPassword: 'court' }, 'PASSWORD_TOO_SHORT'],
        [{ currentPassword: temporaryPassword, newPassword: 12345678 }, 'PASSWORD_TOO_SHORT'],
        [{ currentPassword: temporaryPassword, newPassword: temporaryPassword }, 'PASSWORD_UNCHANGED'],
      ];
      for (const [body, code] of cases) {
        const response = await call('/api/applicant-auth/change-password', { method: 'POST', cookie: access(tempAccess), body });
        assert.equal(response.status, 400, code);
        assert.equal(((await response.json()) as Json).code, code);
      }
      assert.deepEqual(await applicantRow(), before);
    });

    it('a valid change: new pair at version 3, change cleared, audited for the applicant without secret', async () => {
      const response = await call('/api/applicant-auth/change-password', {
        method: 'POST',
        cookie: access(tempAccess),
        body: { currentPassword: temporaryPassword, newPassword: NEW_PASSWORD },
      });
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as { applicant: Json }).applicant.mustChangePassword, false);
      const jar = cookiesOf(response);
      newAccess = jar[accessName];
      assert.equal((jsonwebtoken.decode(newAccess) as Json).authVersion, 3);
      assert.equal((jsonwebtoken.decode(jar[refreshName]) as Json).authVersion, 3);

      const row = await applicantRow();
      assert.equal(row.auth_version, 3);
      assert.equal(row.must_change_password, false);
      assert.ok(await bcrypt.compare(NEW_PASSWORD, row.password_hash));

      const audits = (
        await pool.query(`SELECT user_id, applicant_id, entity_id, details FROM audit_logs WHERE action = 'APPLICANT_PASSWORD_CHANGED' AND entity_id = $1`, [
          applicantId,
        ])
      ).rows;
      assert.equal(audits.length, 1);
      assert.equal(audits[0].applicant_id, applicantId);
      assert.equal(audits[0].user_id, null);
      assert.deepEqual(audits[0].details, { forced: true, sessions_invalidated: true });
      for (const secret of [NEW_PASSWORD, temporaryPassword]) {
        const leaked = await one(`SELECT count(*)::int AS n FROM audit_logs WHERE created_at >= $1 AND details::text LIKE $2`, [
          startedAt,
          `%${secret}%`,
        ]);
        assert.equal(leaked.n, 0);
      }
    });

    it('the temporary session is dead; the new one opens the portal', async () => {
      assert.deepEqual(await businessStatus(access(tempAccess)), { mine: 401, either: 401, file: 401 });
      const refreshed = await call('/api/applicant-auth/refresh', { method: 'POST', cookie: `${refreshName}=${tempRefresh}` });
      assert.equal(refreshed.status, 401);
      assert.equal((await call('/api/requests/mine', { cookie: access(newAccess) })).status, 200);
    });

    it('the temporary password no longer logs in; the new one does', async () => {
      assert.equal((await login(temporaryPassword)).status, 401);
      const fresh = await login(NEW_PASSWORD);
      assert.equal(fresh.status, 200);
      assert.equal(((await fresh.json()) as { applicant: Json }).applicant.mustChangePassword, false);
    });

    it('SU reset succeeds too and moves the version by exactly one', async () => {
      const before = await applicantRow();
      const response = await reset(applicantId, staffCookie(suId, ['SU']));
      assert.equal(response.status, 200);
      const row = await applicantRow();
      assert.equal(row.auth_version, before.auth_version + 1);
      assert.equal(row.must_change_password, true);
      assert.equal((await call('/api/requests/mine', { cookie: access(newAccess) })).status, 401);
      const audit = await one(`SELECT user_id FROM audit_logs WHERE action = 'APPLICANT_PASSWORD_RESET' AND entity_id = $1 ORDER BY id DESC LIMIT 1`, [
        applicantId,
      ]);
      assert.equal(audit.user_id, suId);
    });

    it('a suspension revokes a live access token at once (session check on every request)', async () => {
      const response = await login(((await reset(applicantId, staffCookie(suId, ['SU'])).then((r) => r.json())) as { temporaryPassword: string }).temporaryPassword);
      const token = cookiesOf(response)[accessName];
      assert.equal((await call('/api/applicant-auth/me', { cookie: access(token) })).status, 200);
      await pool.query('UPDATE applicants SET active = false WHERE id = $1', [applicantId]);
      assert.equal((await call('/api/applicant-auth/me', { cookie: access(token) })).status, 401);
      await pool.query('UPDATE applicants SET active = true WHERE id = $1', [applicantId]);
    });
  });
});
