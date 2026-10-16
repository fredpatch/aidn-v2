import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dashboardRoute from './dashboard.route.js';

describe('dashboard routes (SESSION1-COCKPIT-1)', () => {
  it('keeps /summary only; the role summaries are gone', () => {
    const paths = (dashboardRoute as unknown as { stack: Array<{ route?: { path: string } }> }).stack
      .map((layer) => layer.route?.path)
      .filter(Boolean);
    assert.deepEqual(paths, ['/summary']);
  });
});
