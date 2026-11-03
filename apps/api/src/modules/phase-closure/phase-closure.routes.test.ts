/** WORKFLOW-FOUNDATION-1A - who may drive the closure courrier: DN authority
 *  (dn_supervisor, SU - not dn_agent) deposits it; Reception / Assistant DG
 *  (and SU) run the signature circuit. Every case below stops before the
 *  database (role refusal, missing file, invalid id), so no DATABASE_URL. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

process.env.JWT_SECRET ??= 'phase-closure-test-secret';
process.env.JWT_REFRESH_SECRET ??= 'phase-closure-test-refresh-secret';

describe('phase closure routes - RBAC', () => {
  let server: Server;
  let baseUrl: string;
  let closeAppPool: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jwt: Record<string, any>;
  let accessCookieName = '';

  before(async () => {
    const [{ default: express }, { default: cookieParser }, { default: route }, jwtModule, guards, dbModule] = await Promise.all([
      import('express'),
      import('cookie-parser'),
      import('./phase-closure.route.js'),
      import('../../shared/utils/jwt.js'),
      import('../../shared/guards/auth.middleware.js'),
      import('../../shared/db/index.js'),
    ]);
    jwt = jwtModule;
    accessCookieName = guards.ACCESS_TOKEN_COOKIE;
    closeAppPool = () => dbModule.db.$client.end();
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/phase-closures', route);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await closeAppPool();
  });

  const post = (path: string, roles: string[]) => {
    const token = jwt.signAccessToken({ kind: 'staff', userId: 1, employeeCode: 'E1', roles });
    return fetch(`${baseUrl}/api/phase-closures${path}`, {
      method: 'POST',
      headers: { Cookie: `${accessCookieName}=${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  };

  it('deposit: dn_supervisor and SU pass the guard (then need a file); dn_agent, reception, assistant_dg are refused', async () => {
    for (const role of ['dn_supervisor', 'SU']) {
      const response = await post('/phases/12', [role]);
      assert.equal(response.status, 400, role);
      assert.equal(((await response.json()) as { code: string }).code, 'UPLOAD_ASSET_REQUIRED', role);
    }
    for (const role of ['dn_agent', 'reception', 'assistant_dg', 'assistant_dn', 's5_agent', 'r3_agent']) {
      assert.equal((await post('/phases/12', [role])).status, 403, role);
    }
  });

  it('circuit steps: reception, assistant_dg and SU pass the guard; DN roles are refused', async () => {
    for (const path of ['/abc/in-circuit', '/abc/return']) {
      for (const role of ['reception', 'assistant_dg', 'SU']) {
        const response = await post(path, [role]);
        const body = (await response.json()) as { code: string };
        assert.ok([400, 404].includes(response.status), `${path} ${role}`);
        assert.ok(['PHASE_CLOSURE_NOT_FOUND', 'UPLOAD_ASSET_REQUIRED'].includes(body.code), `${path} ${role}`);
      }
      for (const role of ['dn_agent', 'dn_supervisor']) {
        assert.equal((await post(path, [role])).status, 403, `${path} ${role}`);
      }
    }
  });

  it('unauthenticated: 401', async () => {
    const response = await fetch(`${baseUrl}/api/phase-closures/phases/12`);
    assert.equal(response.status, 401);
  });
});
