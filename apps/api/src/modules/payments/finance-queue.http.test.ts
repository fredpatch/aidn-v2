/** SESSION1-COCKPIT-1 - GET /api/payments/finance-queue over real HTTP: the
 *  router behind cookie-parser, as in server.ts. 401 without a cookie, 403 for
 *  a role outside Finance, 200 for s5_agent (needs DATABASE_URL). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

process.env.JWT_SECRET ??= 'cockpit1-http-test-secret';

describe('GET /api/payments/finance-queue (HTTP)', () => {
  let server: Server;
  let baseUrl: string;
  let cookieFor: (roles: string[]) => string;
  let closeAppPool: () => Promise<void>;

  before(async () => {
    const [{ default: express }, { default: cookieParser }, { default: route }, jwt, guards, dbModule] = await Promise.all([
      import('express'),
      import('cookie-parser'),
      import('./payments.route.js'),
      import('../../shared/utils/jwt.js'),
      import('../../shared/guards/auth.middleware.js'),
      import('../../shared/db/index.js'),
    ]);
    closeAppPool = () => dbModule.db.$client.end();
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/payments', route);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    cookieFor = (roles) =>
      `${guards.ACCESS_TOKEN_COOKIE}=${jwt.signAccessToken({ kind: 'staff', userId: 1, employeeCode: 'T', roles })}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await closeAppPool();
  });

  const get = (cookie?: string) => fetch(`${baseUrl}/api/payments/finance-queue`, { headers: cookie ? { Cookie: cookie } : {} });

  it('without a cookie: 401', async () => {
    assert.equal((await get()).status, 401);
  });

  it('dn_agent: 403', async () => {
    assert.equal((await get(cookieFor(['dn_agent']))).status, 403);
  });

  it('r3_agent: 403', async () => {
    assert.equal((await get(cookieFor(['r3_agent']))).status, 403);
  });

  it('s5_agent: 200 with items and counts', { skip: process.env.DATABASE_URL ? false : 'DATABASE_URL not set' }, async () => {
    const response = await get(cookieFor(['s5_agent']));
    assert.equal(response.status, 200);
    const body = (await response.json()) as { items: unknown; counts: unknown };
    assert.ok(Array.isArray(body.items));
    assert.equal(typeof body.counts, 'object');
  });
});
