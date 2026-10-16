/** BUG-PORTAL-INTAKE-1 - authenticateEither chooses the session by identity
 *  domain, never by fallback: portal app -> applicant only, admin app ->
 *  staff only, unknown app -> the single valid session, two valid sessions
 *  -> 401 AMBIGUOUS_SESSION. Real HTTP, no database. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jsonwebtoken from 'jsonwebtoken';

process.env.JWT_SECRET ??= 'auth-either-http-test-secret';
const PORTAL = 'http://portal.test:5174';
const ADMIN = 'http://admin.test:5173';

type Cookie = 'valid' | 'expired' | 'invalid' | undefined;

describe('authenticateEither identity resolution (HTTP)', () => {
  let server: Server;
  let baseUrl: string;
  let cookieHeader: (staff: Cookie, applicant: Cookie) => string;
  const savedEnv = { portal: process.env.PORTAL_ORIGIN, admin: process.env.ADMIN_ORIGIN };

  before(async () => {
    process.env.PORTAL_ORIGIN = PORTAL;
    process.env.ADMIN_ORIGIN = ADMIN;
    const [{ default: express }, { default: cookieParser }, jwt, guards] = await Promise.all([
      import('express'),
      import('cookie-parser'),
      import('../utils/jwt.js'),
      import('./auth.middleware.js'),
    ]);
    const app = express();
    app.use(cookieParser());
    app.all('/probe', guards.authenticateEither, (req, res) => {
      res.json({ who: req.user ? 'staff' : req.applicant ? 'applicant' : 'none', both: !!req.user && !!req.applicant });
    });
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const staffPayload = { kind: 'staff' as const, userId: 11, employeeCode: 'E011', roles: ['reception'] };
    const applicantPayload = { kind: 'applicant' as const, applicantId: 22, organisationId: 7, email: 'p@test.local' };
    const past = Math.floor(Date.now() / 1000) - 60;
    const tokens = {
      staff: {
        valid: jwt.signAccessToken(staffPayload),
        expired: jsonwebtoken.sign({ ...staffPayload, exp: past }, process.env.JWT_SECRET!, { audience: 'aidn-users' }),
        invalid: jsonwebtoken.sign(staffPayload, 'another-secret', { audience: 'aidn-users' }),
      },
      applicant: {
        valid: jwt.signApplicantAccessToken(applicantPayload),
        expired: jsonwebtoken.sign({ ...applicantPayload, exp: past }, process.env.JWT_SECRET!, { audience: 'aidn-users' }),
        invalid: jsonwebtoken.sign(applicantPayload, 'another-secret', { audience: 'aidn-users' }),
      },
    };
    cookieHeader = (staff, applicant) =>
      [
        staff ? `${guards.ACCESS_TOKEN_COOKIE}=${tokens.staff[staff]}` : null,
        applicant ? `${guards.APPLICANT_ACCESS_TOKEN_COOKIE}=${tokens.applicant[applicant]}` : null,
      ]
        .filter(Boolean)
        .join('; ');
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    process.env.PORTAL_ORIGIN = savedEnv.portal;
    process.env.ADMIN_ORIGIN = savedEnv.admin;
    if (savedEnv.portal === undefined) delete process.env.PORTAL_ORIGIN;
    if (savedEnv.admin === undefined) delete process.env.ADMIN_ORIGIN;
  });

  async function probe(opts: { staff?: Cookie; applicant?: Cookie; origin?: string; referer?: string; method?: string }) {
    const headers: Record<string, string> = {};
    const cookie = cookieHeader(opts.staff, opts.applicant);
    if (cookie) headers.Cookie = cookie;
    if (opts.origin) headers.Origin = opts.origin;
    if (opts.referer) headers.Referer = opts.referer;
    const response = await fetch(`${baseUrl}/probe`, { method: opts.method ?? 'POST', headers });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  describe('Origin = PORTAL_ORIGIN', () => {
    it('1. applicant valid only -> applicant', async () => {
      assert.deepEqual(await probe({ origin: PORTAL, applicant: 'valid' }), { status: 200, body: { who: 'applicant', both: false } });
    });
    it('2. applicant valid + staff valid -> applicant', async () => {
      assert.deepEqual(await probe({ origin: PORTAL, applicant: 'valid', staff: 'valid' }), { status: 200, body: { who: 'applicant', both: false } });
    });
    it('3. applicant valid + staff invalid -> applicant', async () => {
      assert.deepEqual(await probe({ origin: PORTAL, applicant: 'valid', staff: 'invalid' }), { status: 200, body: { who: 'applicant', both: false } });
    });
    it('4. applicant expired + staff valid -> 401 TOKEN_EXPIRED, never staff', async () => {
      const { status, body } = await probe({ origin: PORTAL, applicant: 'expired', staff: 'valid' });
      assert.equal(status, 401);
      assert.equal(body.code, 'TOKEN_EXPIRED');
    });
    it('4b. applicant invalid + staff valid -> 401 applicant failure, never staff', async () => {
      const { status, body } = await probe({ origin: PORTAL, applicant: 'invalid', staff: 'valid' });
      assert.equal(status, 401);
      assert.equal(body.code, 'TOKEN_EXPIRED');
    });
    it('5. applicant missing + staff valid -> 401 Non authentifié, never staff', async () => {
      assert.deepEqual(await probe({ origin: PORTAL, staff: 'valid' }), { status: 401, body: { message: 'Non authentifié.' } });
    });
  });

  describe('Origin = ADMIN_ORIGIN', () => {
    it('6. staff valid only -> staff', async () => {
      assert.deepEqual(await probe({ origin: ADMIN, staff: 'valid' }), { status: 200, body: { who: 'staff', both: false } });
    });
    it('7. staff valid + applicant valid -> staff', async () => {
      assert.deepEqual(await probe({ origin: ADMIN, staff: 'valid', applicant: 'valid' }), { status: 200, body: { who: 'staff', both: false } });
    });
    it('8. staff expired + applicant valid -> 401 TOKEN_EXPIRED, never applicant', async () => {
      const { status, body } = await probe({ origin: ADMIN, staff: 'expired', applicant: 'valid' });
      assert.equal(status, 401);
      assert.equal(body.code, 'TOKEN_EXPIRED');
    });
    it('9. staff missing + applicant valid -> 401 Non authentifié, never applicant', async () => {
      assert.deepEqual(await probe({ origin: ADMIN, applicant: 'valid' }), { status: 401, body: { message: 'Non authentifié.' } });
    });
  });

  describe('unknown or absent Origin', () => {
    it('10. only staff valid -> staff', async () => {
      assert.deepEqual(await probe({ staff: 'valid', applicant: 'expired' }), { status: 200, body: { who: 'staff', both: false } });
    });
    it('11. only applicant valid -> applicant', async () => {
      assert.deepEqual(await probe({ origin: 'http://elsewhere.test', applicant: 'valid', staff: 'invalid' }), {
        status: 200,
        body: { who: 'applicant', both: false },
      });
    });
    it('12. both valid -> 401 AMBIGUOUS_SESSION', async () => {
      assert.deepEqual(await probe({ staff: 'valid', applicant: 'valid' }), {
        status: 401,
        body: { message: 'Session ambiguë : reconnectez-vous depuis l’application concernée.', code: 'AMBIGUOUS_SESSION' },
      });
      const unknown = await probe({ origin: 'http://elsewhere.test', staff: 'valid', applicant: 'valid' });
      assert.equal(unknown.body.code, 'AMBIGUOUS_SESSION');
    });
    it('13. neither valid -> 401', async () => {
      assert.deepEqual(await probe({ staff: 'expired', applicant: 'invalid' }), { status: 401, body: { message: 'Non authentifié.' } });
      assert.equal((await probe({})).status, 401);
    });
  });

  describe('Referer when the browser omits Origin (same-origin GET via proxy)', () => {
    it('portal page Referer -> applicant, even with a valid staff session', async () => {
      assert.deepEqual(await probe({ method: 'GET', referer: `${PORTAL}/demandes/3`, staff: 'valid', applicant: 'valid' }), {
        status: 200,
        body: { who: 'applicant', both: false },
      });
    });
    it('admin page Referer -> staff, even with a valid applicant session', async () => {
      assert.deepEqual(await probe({ method: 'GET', referer: `${ADMIN}/demandes/3`, staff: 'valid', applicant: 'valid' }), {
        status: 200,
        body: { who: 'staff', both: false },
      });
    });
    it('a present Origin wins over Referer', async () => {
      const { status } = await probe({ origin: PORTAL, referer: `${ADMIN}/x`, staff: 'valid' });
      assert.equal(status, 401);
    });
    it('unrecognized Referer -> unknown app rules', async () => {
      const { body } = await probe({ method: 'GET', referer: 'http://elsewhere.test/x', staff: 'valid', applicant: 'valid' });
      assert.equal(body.code, 'AMBIGUOUS_SESSION');
    });
  });
});
