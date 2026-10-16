import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import certificatesRoute from '../certificates/certificates.route.js';
import deepEvaluationRoute from '../deep-evaluation/deep-evaluation.route.js';
import siteInspectionRoute from '../site-inspection/site-inspection.route.js';

type Layer = { route?: { path: string } };
const paths = (router: unknown): string[] =>
  (router as { stack: Layer[] }).stack.map((layer) => layer.route?.path).filter((p): p is string => Boolean(p));

describe('per-phase payment queues are gone (SESSION1-COCKPIT-1, Finance queue replaces them)', () => {
  for (const [name, router] of [
    ['certificates', certificatesRoute],
    ['deep-evaluation', deepEvaluationRoute],
    ['site-inspection', siteInspectionRoute],
  ] as const) {
    it(`${name} no longer exposes /payment-queue`, () => {
      assert.ok(paths(router).length > 0, 'router has routes (sanity)');
      assert.equal(paths(router).some((p) => p.includes('payment-queue')), false);
    });
  }
});
