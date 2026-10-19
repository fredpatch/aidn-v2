/** ROLE-ANALYTICS-1B / 1C - GET /api/analytics/roles/:domain and /overview
 *  over real HTTP (the router behind cookie-parser, as in server.ts). Access
 *  (400 / 403 / 401) and the unimplemented domains (finance, inspection: 501)
 *  need no database; the 1C providers (courrier, dn_circuit) and /overview
 *  answer 200 against one (those checks are skipped without DATABASE_URL). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import {
  ROLE_ANALYTICS_DOMAINS,
  ROLE_ANALYTICS_SCOPES,
  type RoleAnalyticsDomain,
  type RoleAnalyticsOverview,
  type RoleAnalyticsScope,
} from '@aidn/shared';

process.env.JWT_SECRET ??= 'role-analytics-http-test-secret';

/** The frozen matrix, written out (not imported) so the test pins it. */
const ALLOWED: Record<RoleAnalyticsDomain, Record<RoleAnalyticsScope, string[]>> = {
  courrier: { mine: ['reception', 'assistant_dg', 'SU'], service: ['reception', 'assistant_dg', 'SU'] },
  dn_circuit: { mine: ['assistant_dn', 'SU'], service: ['assistant_dn', 'SU'] },
  finance: { mine: ['s5_agent', 'SU'], service: ['s5_agent', 'SU'] },
  inspection: { mine: ['r3_agent', 'SU'], service: ['SU'] },
};
const IMPLEMENTED: readonly string[] = ['courrier', 'dn_circuit'];
const HAS_DB = Boolean(process.env.DATABASE_URL);
const ROLES = ['reception', 'assistant_dg', 'assistant_dn', 'dn_agent', 'dn_supervisor', 'r3_agent', 's5_agent', 'SU'];

describe('analytics routes (HTTP)', () => {
  let server: Server;
  let baseUrl: string;
  let cookieFor: (roles: string[]) => string;
  let closeAppPool: () => Promise<void>;

  before(async () => {
    const [{ default: express }, { default: cookieParser }, { default: route }, jwt, guards, dbModule] = await Promise.all([
      import('express'),
      import('cookie-parser'),
      import('./analytics.route.js'),
      import('../../shared/utils/jwt.js'),
      import('../../shared/guards/auth.middleware.js'),
      import('../../shared/db/index.js'),
    ]);
    closeAppPool = () => dbModule.db.$client.end();
    const app = express();
    app.use(cookieParser());
    app.use('/api/analytics', route);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    cookieFor = (roles) =>
      `${guards.ACCESS_TOKEN_COOKIE}=${jwt.signAccessToken({ kind: 'staff', userId: 1, employeeCode: 'E001', roles })}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await closeAppPool();
  });

  async function get(path: string, roles: string[] | null) {
    const response = await fetch(`${baseUrl}/api/analytics${path}`, roles ? { headers: { Cookie: cookieFor(roles) } } : {});
    return { status: response.status, body: (await response.json()) as { code?: string } };
  }

  const roleUrl = (domain: string, scope: string, extra = '&period=this_month') => `/roles/${domain}?scope=${scope}${extra}`;

  it('the frozen matrix: allowed roles reach the provider (200 for the 1C domains, 501 otherwise), others get 403', async () => {
    for (const domain of ROLE_ANALYTICS_DOMAINS) {
      for (const scope of ROLE_ANALYTICS_SCOPES) {
        for (const role of ROLES) {
          const allowed = ALLOWED[domain][scope].includes(role);
          const implemented = IMPLEMENTED.includes(domain);
          if (allowed && implemented && !HAS_DB) continue;
          const { status, body } = await get(roleUrl(domain, scope), [role]);
          if (allowed && implemented) {
            assert.equal(status, 200, `${role} ${domain}/${scope}`);
            const overview = body as unknown as RoleAnalyticsOverview;
            assert.equal(overview.domain, domain);
            assert.equal(overview.scope, scope);
            if (scope === 'mine') assert.ok(overview.metrics.every((m) => m.basis === 'period'), 'no shared queue under mine');
          } else if (allowed) {
            assert.equal(status, 501, `${role} ${domain}/${scope}`);
            assert.equal(body.code, 'ROLE_ANALYTICS_NOT_IMPLEMENTED');
          } else {
            assert.equal(status, 403, `${role} ${domain}/${scope}`);
            assert.equal(body.code, 'ROLE_ANALYTICS_FORBIDDEN');
          }
        }
      }
    }
  });

  it('inspection service stays SU-only; dn_supervisor has no role dashboard', async () => {
    assert.equal((await get(roleUrl('inspection', 'service'), ['r3_agent'])).status, 403);
    assert.equal((await get(roleUrl('inspection', 'mine'), ['r3_agent'])).status, 501);
    for (const domain of ROLE_ANALYTICS_DOMAINS) {
      assert.equal((await get(roleUrl(domain, 'service'), ['dn_supervisor'])).status, 403);
    }
  });

  it('multi-role users get every domain one of their roles grants', async () => {
    const roles = ['reception', 's5_agent'];
    if (HAS_DB) assert.equal((await get(roleUrl('courrier', 'mine'), roles)).status, 200);
    assert.equal((await get(roleUrl('finance', 'service'), roles)).status, 501);
    assert.equal((await get(roleUrl('dn_circuit', 'mine'), roles)).status, 403);
    assert.equal((await get(roleUrl('inspection', 'service'), ['r3_agent', 'dn_agent'])).status, 403);
  });

  it('invalid domain and scope are 400, distinct from 403, even for a role without access', async () => {
    assert.deepEqual(await get(roleUrl('payments', 'mine'), ['SU']), {
      status: 400,
      body: { message: 'Domaine analytique inconnu.', code: 'INVALID_ANALYTICS_DOMAIN' },
    });
    assert.equal((await get(roleUrl('payments', 'mine'), ['dn_agent'])).body.code, 'INVALID_ANALYTICS_DOMAIN');
    assert.equal((await get(roleUrl('finance', 'all'), ['s5_agent'])).body.code, 'INVALID_ANALYTICS_SCOPE');
    assert.equal((await get('/roles/finance?period=today', ['s5_agent'])).body.code, 'INVALID_ANALYTICS_SCOPE');
  });

  it('an invalid period is 400 INVALID_ANALYTICS_PERIOD for an authorized caller, 403 otherwise', async () => {
    for (const extra of ['', '&period=yesterday', '&period=custom', '&period=custom&from=2026-10-05&to=2026-10-01', '&period=custom&from=2025-01-01&to=2026-12-31']) {
      const { status, body } = await get(roleUrl('finance', 'mine', extra), ['s5_agent']);
      assert.equal(status, 400, extra);
      assert.equal(body.code, 'INVALID_ANALYTICS_PERIOD');
    }
    assert.equal((await get(roleUrl('finance', 'mine', '&period=yesterday'), ['dn_agent'])).status, 403);
    assert.equal((await get(roleUrl('finance', 'mine', '&period=custom&from=2026-10-01&to=2026-10-31'), ['s5_agent'])).status, 501);
  });

  it('unauthenticated calls are 401', async () => {
    assert.equal((await get(roleUrl('courrier', 'mine'), null)).status, 401);
    assert.equal((await get('/overview', null)).status, 401);
  });

  it('/overview stays dn_supervisor / SU only', async () => {
    for (const role of ROLES.filter((r) => r !== 'dn_supervisor' && r !== 'SU')) {
      assert.equal((await get('/overview', [role])).status, 403, role);
    }
  });

  it(
    '/overview answers dn_supervisor and SU',
    { skip: process.env.DATABASE_URL ? false : 'DATABASE_URL not set' },
    async () => {
      for (const role of ['dn_supervisor', 'SU']) {
        const { status, body } = await get('/overview', [role]);
        assert.equal(status, 200, role);
        assert.ok(Array.isArray((body as unknown as { phaseStats: unknown[] }).phaseStats));
      }
    }
  );
});
