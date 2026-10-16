/** ROLE-ANALYTICS-1B - dispatch to a registered provider: the provider gets
 *  the validated domain, scope, Libreville period and viewer; nothing is
 *  returned without one. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { RoleAnalyticsOverview } from '@aidn/shared';
import {
  ROLE_ANALYTICS_PROVIDERS,
  getRoleAnalyticsOverview,
  type RoleAnalyticsContext,
  type RoleAnalyticsRegistry,
} from './role-analytics.service.js';

const NOW = new Date('2026-10-16T09:00:00Z');

describe('getRoleAnalyticsOverview', () => {
  it('no provider is registered in 1B: nothing is fabricated', async () => {
    assert.deepEqual(Object.keys(ROLE_ANALYTICS_PROVIDERS), []);
    await assert.rejects(
      getRoleAnalyticsOverview({ domain: 'finance', scope: 'mine', period: 'today' }, { userId: 7, roles: ['s5_agent'] }),
      /ROLE_ANALYTICS_NOT_IMPLEMENTED/
    );
  });

  it('passes the resolved context to the domain provider', async () => {
    const seen: RoleAnalyticsContext[] = [];
    const registry: RoleAnalyticsRegistry = {
      finance: {
        async getOverview(context) {
          seen.push(context);
          const overview: RoleAnalyticsOverview = {
            domain: context.domain,
            scope: context.scope,
            period: context.period,
            generatedAt: context.now.toISOString(),
            metrics: [],
            warnings: [],
            recentActivity: [],
          };
          return overview;
        },
      },
    };
    const result = await getRoleAnalyticsOverview(
      { domain: 'finance', scope: 'mine', period: 'custom', from: '2026-10-01', to: '2026-10-15' },
      { userId: 7, roles: ['s5_agent'] },
      registry,
      NOW
    );
    assert.equal(seen.length, 1);
    assert.equal(seen[0].domain, 'finance');
    assert.equal(seen[0].scope, 'mine');
    assert.deepEqual(seen[0].viewer, { userId: 7, roles: ['s5_agent'] });
    assert.equal(seen[0].period.start, '2026-09-30T23:00:00.000Z');
    assert.equal(seen[0].period.end, '2026-10-15T23:00:00.000Z');
    assert.equal(result.domain, 'finance');
    // Another domain still has no provider.
    await assert.rejects(
      getRoleAnalyticsOverview({ domain: 'courrier', scope: 'mine', period: 'today' }, { userId: 7, roles: ['SU'] }, registry, NOW),
      /ROLE_ANALYTICS_NOT_IMPLEMENTED/
    );
  });

  it('access is checked before the provider is called', async () => {
    let called = false;
    const registry: RoleAnalyticsRegistry = {
      inspection: {
        async getOverview() {
          called = true;
          throw new Error('unreachable');
        },
      },
    };
    await assert.rejects(
      getRoleAnalyticsOverview({ domain: 'inspection', scope: 'service', period: 'today' }, { userId: 3, roles: ['r3_agent'] }, registry, NOW),
      /ROLE_ANALYTICS_FORBIDDEN/
    );
    assert.equal(called, false);
  });
});
