import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.JWT_SECRET ??= 'team-test-secret';
process.env.JWT_REFRESH_SECRET ??= 'team-test-refresh';

describe('dossier team HTTP boundary', () => {
  let server: Server;
  let base: string;
  let token: (roles: string[]) => string;
  let closePool: () => Promise<void>;
  before(async () => {
    const [{ default: express }, { default: cookies }, { default: route }, jwt, { db }] =
      await Promise.all([
        import('express'),
        import('cookie-parser'),
        import('./dossier-teams.route.js'),
        import('../../shared/utils/jwt.js'),
        import('../../shared/db/index.js'),
      ]);
    const app = express();
    app.use(express.json(), cookies());
    app.use('/api', route);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    token = (roles) => jwt.signAccessToken({ kind: 'staff', userId: 1, employeeCode: 'T1', roles });
    closePool = () => db.$client.end();
  });
  after(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await closePool?.();
  });
  const call = (path: string, roles?: string[], method = 'GET', body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        ...(roles ? { Cookie: `aidn_access=${token(roles)}` } : {}),
        'Content-Type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  it('requires staff authentication on every endpoint', async () => {
    for (const path of ['/requests/1/team', '/dossier-teams/eligible-members']) {
      assert.equal((await call(path)).status, 401);
    }
    assert.equal((await call('/requests/1/team-proposal', undefined, 'PUT', {})).status, 401);
  });
  it('agents read but cannot mutate; unrelated staff cannot read', async () => {
    assert.equal((await call('/requests/1/team-proposal', ['dn_agent'], 'PUT', {})).status, 403);
    for (const role of ['reception', 'assistant_dn', 'assistant_dg', 'r3_agent', 's5_agent']) {
      assert.equal((await call('/requests/1/team', [role])).status, 403);
      assert.equal((await call('/dossier-teams/eligible-members', [role])).status, 403);
    }
    assert.equal((await call('/requests/abc/team', ['dn_agent'])).status, 404);
  });
  it('supervisor/SU and multi-role supervisors pass the gate and validate input', async () => {
    for (const roles of [['dn_supervisor'], ['SU'], ['dn_agent', 'dn_supervisor']]) {
      const response = await call('/requests/1/team-proposal', roles, 'PUT', {});
      assert.equal(response.status, 400);
      assert.equal(((await response.json()) as { code: string }).code, 'INVALID_TEAM_PROPOSAL');
    }
  });
  it('has no production finalization command', async () => {
    for (const path of [
      '/requests/1/team',
      '/requests/1/team/finalize',
      '/dossier-teams/1/finalize',
    ]) {
      assert.equal((await call(path, ['SU'], 'POST', {})).status, 404);
    }
  });
});
