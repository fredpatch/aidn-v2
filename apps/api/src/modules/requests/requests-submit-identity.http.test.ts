/** BUG-PORTAL-INTAKE-1 - a portal submission must never be handled as a
 *  reception manual entry because the same browser also holds a staff
 *  session. Real HTTP through requests.route; the asserted paths stop
 *  before any database access. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jsonwebtoken from 'jsonwebtoken';

process.env.JWT_SECRET ??= 'portal-intake-http-test-secret';
const PORTAL = 'http://portal.test:5174';
const ADMIN = 'http://admin.test:5173';
const MANUAL_ENTRY_MESSAGE = 'applicantId requis pour une saisie manuelle.';

describe('POST /api/requests identity (HTTP)', () => {
  let server: Server;
  let baseUrl: string;
  let staffCookie: string;
  let applicantCookie: string;
  let expiredApplicantCookie: string;
  let closeAppPool: () => Promise<void>;
  const savedEnv = { portal: process.env.PORTAL_ORIGIN, admin: process.env.ADMIN_ORIGIN };

  before(async () => {
    process.env.PORTAL_ORIGIN = PORTAL;
    process.env.ADMIN_ORIGIN = ADMIN;
    const [{ default: express }, { default: cookieParser }, { default: route }, jwt, guards, dbModule] = await Promise.all([
      import('express'),
      import('cookie-parser'),
      import('./requests.route.js'),
      import('../../shared/utils/jwt.js'),
      import('../../shared/guards/auth.middleware.js'),
      import('../../shared/db/index.js'),
    ]);
    closeAppPool = () => dbModule.db.$client.end();
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/requests', route);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const applicantPayload = { kind: 'applicant' as const, applicantId: 987654321, organisationId: 7, email: 'p@test.local' };
    staffCookie = `${guards.ACCESS_TOKEN_COOKIE}=${jwt.signAccessToken({ kind: 'staff', userId: 1, employeeCode: 'E001', roles: ['reception'] })}`;
    applicantCookie = `${guards.APPLICANT_ACCESS_TOKEN_COOKIE}=${jwt.signApplicantAccessToken(applicantPayload)}`;
    const expired = jsonwebtoken.sign({ ...applicantPayload, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET!, {
      audience: 'aidn-users',
    });
    expiredApplicantCookie = `${guards.APPLICANT_ACCESS_TOKEN_COOKIE}=${expired}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await closeAppPool();
    process.env.PORTAL_ORIGIN = savedEnv.portal;
    process.env.ADMIN_ORIGIN = savedEnv.admin;
    if (savedEnv.portal === undefined) delete process.env.PORTAL_ORIGIN;
    if (savedEnv.admin === undefined) delete process.env.ADMIN_ORIGIN;
  });

  async function submit(origin: string, cookies: string[], body: Record<string, unknown> = {}) {
    const response = await fetch(`${baseUrl}/api/requests`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookies.join('; '), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as { message?: string; code?: string } };
  }

  it('portal + valid applicant + valid staff, no applicantId: applicant self-submission branch', async () => {
    // No requestType: the applicant branch answers its own validation error,
    // the manual-entry branch would have stopped on applicantId first.
    const { status, body } = await submit(PORTAL, [staffCookie, applicantCookie]);
    assert.equal(status, 400);
    assert.equal(body.message, 'requestType est requis.');
    assert.notEqual(body.message, MANUAL_ENTRY_MESSAGE);
  });

  it('portal + expired applicant + valid staff: 401 TOKEN_EXPIRED, not the manual branch', async () => {
    const { status, body } = await submit(PORTAL, [staffCookie, expiredApplicantCookie], { requestType: 'new_approval' });
    assert.equal(status, 401);
    assert.equal(body.code, 'TOKEN_EXPIRED');
    assert.notEqual(body.message, MANUAL_ENTRY_MESSAGE);
  });

  it('admin + valid staff + valid applicant, no applicantId: still the manual-entry branch', async () => {
    const { status, body } = await submit(ADMIN, [staffCookie, applicantCookie], { requestType: 'new_approval' });
    assert.equal(status, 400);
    assert.equal(body.message, MANUAL_ENTRY_MESSAGE);
  });
});
