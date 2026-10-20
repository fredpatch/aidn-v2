/** AUTH-ENUMERATION-1 - the two public login endpoints answer every credential
 *  failure with one identical response (401 INVALID_CREDENTIALS), so they no
 *  longer reveal whether an account exists or is active. Lockout, first-login
 *  OTP, failed-attempt counting, refresh and /me keep their behaviour.
 *  Needs DATABASE_URL (migrated, disposable database). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET ??= 'auth-enumeration-test-secret';
process.env.JWT_REFRESH_SECRET ??= 'auth-enumeration-test-refresh-secret';

const DATABASE_URL = process.env.DATABASE_URL;
const dbSkip = DATABASE_URL ? false : 'DATABASE_URL not set';
const PASSWORD = 'Passw0rd!';
const OTP = '123456';
const GENERIC = { message: 'Identifiants invalides.', code: 'INVALID_CREDENTIALS' };

describe('login responses do not reveal accounts (HTTP)', { skip: dbSkip }, () => {
  let server: Server;
  let baseUrl: string;
  let closeAppPool: () => Promise<void>;
  let pool: pg.Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jwt: Record<string, any>;
  let cookieNames: Record<string, string>;
  const run = Date.now().toString(36);
  const userIds: number[] = [];
  const applicantIds: number[] = [];
  let orgId = 0;
  let maxAttempts = 5;

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
  const post = (path: string, body: unknown, cookie?: string) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
  const failure = async (response: Response) => ({
    status: response.status,
    body: await response.json(),
    setsCookie: response.headers.getSetCookie().length > 0,
  });
  const GENERIC_FAILURE = { status: 401, body: GENERIC, setsCookie: false };

  /** A staff user; `code` is unique per call. */
  async function staff(options: { active?: boolean; firstLogin?: boolean; password?: string | null; otpExpiresInMin?: number | null; failedAttempts?: number } = {}) {
    const code = `AE${run}${userIds.length}`.slice(0, 20);
    const { id } = await one(
      `INSERT INTO users (employee_code, full_name, email, password_hash, active, first_login, otp_hash, otp_expires_at, failed_attempts)
       VALUES ($1, 'Agent', $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        code,
        `ae-${code}@test.local`.toLowerCase(),
        options.password === null ? null : await bcrypt.hash(options.password ?? PASSWORD, 4),
        options.active ?? true,
        options.firstLogin ?? false,
        options.otpExpiresInMin === undefined || options.otpExpiresInMin === null ? null : await bcrypt.hash(OTP, 4),
        // UTC wall time, as drizzle writes and reads this timestamp-without-time-zone column.
        options.otpExpiresInMin === undefined || options.otpExpiresInMin === null ? null : new Date(Date.now() + options.otpExpiresInMin * 60_000).toISOString(),
        options.failedAttempts ?? 0,
      ]
    );
    userIds.push(id);
    return { id, code };
  }
  const userRow = (id: number) => one('SELECT failed_attempts, locked_until FROM users WHERE id = $1', [id]);

  async function applicant(email: string, active: boolean) {
    const { id } = await one(
      `INSERT INTO applicants (organisation_id, full_name, email, password_hash, active) VALUES ($1, 'Postulant', $2, $3, $4) RETURNING id`,
      [orgId, email, await bcrypt.hash(PASSWORD, 4), active]
    );
    applicantIds.push(id);
    return id;
  }

  before(async () => {
    const [{ default: express }, { default: cookieParser }, { default: authRoute }, { default: applicantRoute }, jwtModule, guards, dbModule] =
      await Promise.all([
        import('express'),
        import('cookie-parser'),
        import('./auth.route.js'),
        import('../applicant-auth/applicant-auth.route.js'),
        import('../../shared/utils/jwt.js'),
        import('../../shared/guards/auth.middleware.js'),
        import('../../shared/db/index.js'),
      ]);
    jwt = jwtModule;
    cookieNames = {
      staffAccess: guards.ACCESS_TOKEN_COOKIE,
      staffRefresh: guards.REFRESH_TOKEN_COOKIE,
      applicantAccess: guards.APPLICANT_ACCESS_TOKEN_COOKIE,
      applicantRefresh: guards.APPLICANT_REFRESH_TOKEN_COOKIE,
    };
    closeAppPool = () => dbModule.db.$client.end();
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/auth', authRoute);
    app.use('/api/applicant-auth', applicantRoute);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    orgId = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA Enum ${run}`])).id;
    const parameter = await one(`SELECT value FROM system_parameters WHERE key = 'lockout_max_attempts'`);
    maxAttempts = parameter ? Number(parameter.value) : 5;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    if (pool) {
      await pool.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [userIds]);
      await pool.query(`DELETE FROM audit_logs WHERE module = 'M13' AND entity_id = ANY($1)`, [applicantIds]);
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
      await pool.query('DELETE FROM applicants WHERE id = ANY($1)', [applicantIds]);
      await pool.query('DELETE FROM organisations WHERE id = $1', [orgId]);
      await pool.end();
    }
    await closeAppPool();
  });

  describe('applicant login', () => {
    const login = (email: string, password = PASSWORD) => post('/api/applicant-auth/login', { email, password });

    it('unknown email, inactive account and wrong password: the same public response', async () => {
      const activeEmail = `enum-active-${run}@test.local`;
      const inactiveEmail = `enum-inactive-${run}@test.local`;
      await applicant(activeEmail, true);
      await applicant(inactiveEmail, false);
      const unknown = await failure(await login(`enum-unknown-${run}@test.local`));
      const inactive = await failure(await login(inactiveEmail));
      const wrongPassword = await failure(await login(activeEmail, 'wrong-password'));
      assert.deepEqual(unknown, GENERIC_FAILURE);
      assert.deepEqual(inactive, unknown);
      assert.deepEqual(wrongPassword, unknown);
    });

    it('right password: unchanged success (applicant + both cookies)', async () => {
      const email = `enum-ok-${run}@test.local`;
      const id = await applicant(email, true);
      const response = await login(email);
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as { applicant: { id: number } }).applicant.id, id);
      const names = response.headers.getSetCookie().map((line) => line.split('=')[0]);
      assert.deepEqual(names.sort(), [cookieNames.applicantAccess, cookieNames.applicantRefresh].sort());
    });

    it('missing field: unchanged 400 (no account involved)', async () => {
      const response = await post('/api/applicant-auth/login', { email: 'x@test.local' });
      assert.equal(response.status, 400);
      assert.equal(((await response.json()) as { message: string }).message, 'Email et mot de passe requis.');
    });
  });

  describe('staff password login', () => {
    const login = (employeeCode: string, password: string | null = PASSWORD) =>
      post('/api/auth/login', { employeeCode, ...(password === null ? {} : { password }) });

    it('unknown matricule, inactive user, wrong password, password not set, no password: the same public response', async () => {
      const activeUser = await staff();
      const inactiveUser = await staff({ active: false });
      const noPasswordSet = await staff({ password: null });
      const unknown = await failure(await login(`NOPE${run}`.slice(0, 20)));
      assert.deepEqual(unknown, GENERIC_FAILURE);
      assert.deepEqual(await failure(await login(inactiveUser.code)), unknown);
      assert.deepEqual(await failure(await login(activeUser.code, 'wrong-password')), unknown);
      assert.deepEqual(await failure(await login(noPasswordSet.code)), unknown);
      assert.deepEqual(await failure(await login(activeUser.code, null)), unknown);
    });

    it('right password: unchanged success, failed attempts reset', async () => {
      const user = await staff({ failedAttempts: 2 });
      const response = await login(user.code);
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as { firstLogin: boolean }).firstLogin, false);
      assert.equal((await userRow(user.id)).failed_attempts, 0);
    });

    it('a wrong password still counts; reaching the limit locks the account (423, kept on purpose)', async () => {
      const user = await staff({ failedAttempts: maxAttempts - 2 });
      await login(user.code, 'wrong-password');
      assert.equal((await userRow(user.id)).failed_attempts, maxAttempts - 1);
      assert.deepEqual(await failure(await login(user.code, 'wrong-password')), GENERIC_FAILURE);
      assert.ok((await userRow(user.id)).locked_until, 'locked');
      const locked = await login(user.code);
      assert.equal(locked.status, 423);
      assert.equal(((await locked.json()) as { code: string }).code, 'ACCOUNT_LOCKED');
    });
  });

  describe('staff first login (OTP)', () => {
    const otpLogin = (employeeCode: string, otp: string) => post('/api/auth/login', { employeeCode, otp });

    it('valid OTP: first-login response with the temporary cookie', async () => {
      const user = await staff({ firstLogin: true, otpExpiresInMin: 30 });
      const response = await otpLogin(user.code, OTP);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { firstLogin: true, message: 'OTP valide. Veuillez définir votre mot de passe.' });
      assert.ok(response.headers.getSetCookie().some((line) => line.startsWith(`${cookieNames.staffAccess}=`)));
    });

    it('wrong OTP, unknown matricule, no OTP generated, expired account with a wrong code: the same public response', async () => {
      const pending = await staff({ firstLogin: true, otpExpiresInMin: 30 });
      const noOtp = await staff({ firstLogin: true, otpExpiresInMin: null });
      const expired = await staff({ firstLogin: true, otpExpiresInMin: -120 });
      const unknown = await failure(await otpLogin(`NOPE${run}`.slice(0, 20), '000000'));
      assert.deepEqual(unknown, GENERIC_FAILURE);
      assert.deepEqual(await failure(await otpLogin(pending.code, '000000')), unknown);
      assert.deepEqual(await failure(await otpLogin(noOtp.code, '000000')), unknown);
      assert.deepEqual(await failure(await otpLogin(expired.code, '000000')), unknown);
      // A wrong OTP still counts as a failed attempt; the expired-code check does not (as before).
      assert.equal((await userRow(pending.id)).failed_attempts, 1);
      assert.equal((await userRow(expired.id)).failed_attempts, 0);
    });

    it('expired OTP with the right code: « Code OTP expire. » (only its holder learns it)', async () => {
      const user = await staff({ firstLogin: true, otpExpiresInMin: -120 });
      const response = await otpLogin(user.code, OTP);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { message: 'Code OTP expire.', code: 'OTP_EXPIRED' });
    });

    it('first-login account answered with a password: « Code OTP requis. » (intentionally distinct)', async () => {
      const user = await staff({ firstLogin: true, otpExpiresInMin: 30 });
      const response = await post('/api/auth/login', { employeeCode: user.code, password: PASSWORD });
      assert.equal(response.status, 400);
      assert.equal(((await response.json()) as { code: string }).code, 'OTP_REQUIRED');
    });
  });

  describe('refresh and /me keep their own messages (handleAuthError unchanged)', () => {
    it('staff refresh of a deactivated account: 401 « Compte inactif. » ACCOUNT_INACTIVE', async () => {
      const user = await staff({ active: false });
      const token = jwt.signRefreshToken({ kind: 'staff', userId: user.id, employeeCode: user.code, roles: [] });
      const response = await post('/api/auth/refresh', {}, `${cookieNames.staffRefresh}=${token}`);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { message: 'Compte inactif.', code: 'ACCOUNT_INACTIVE' });
    });

    it('applicant refresh of an inactive account and /me of a missing one: unchanged codes', async () => {
      const id = await applicant(`enum-refresh-${run}@test.local`, false);
      const refreshToken = jwt.signApplicantRefreshToken({ kind: 'applicant', applicantId: id, organisationId: orgId, email: 'x' });
      const refresh = await post('/api/applicant-auth/refresh', {}, `${cookieNames.applicantRefresh}=${refreshToken}`);
      assert.equal(refresh.status, 401);
      assert.deepEqual(await refresh.json(), { message: 'Compte inactif.', code: 'ACCOUNT_INACTIVE' });

      const accessToken = jwt.signApplicantAccessToken({ kind: 'applicant', applicantId: 2_000_000_000, organisationId: orgId, email: 'x' });
      const me = await fetch(`${baseUrl}/api/applicant-auth/me`, { headers: { Cookie: `${cookieNames.applicantAccess}=${accessToken}` } });
      assert.equal(me.status, 401);
      assert.deepEqual(await me.json(), { message: 'Compte introuvable ou inactif.', code: 'ACCOUNT_NOT_FOUND' });
    });
  });
});
