/** SESSION1-COCKPIT-1 - the shared operational contract: urgency rules, bucket
 *  counts, owners (single source) and the B4 held-visit predicate. Pure. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import {
  COURRIER_BUCKETS,
  DN_CIRCUIT_BUCKETS,
  FINANCE_BUCKETS,
  INSPECTION_BUCKETS,
  OPERATIONAL_OWNERS,
  canRecordSiteVisitHeld,
  countBuckets,
  urgencyFromAge,
  visitDayUrgency,
} from '@aidn/shared';
import { OWNERS } from '../requests/cockpit-next-action.js';
import courrierRoute from '../courrier-tasks/courrier-tasks.route.js';
import dnAnnotationRoute from '../dn-annotation/dn-annotation.route.js';

describe('urgencyFromAge (existing dashboard rule, moved unchanged)', () => {
  it('normal below target - 1, warning from max(target - 1, 1), overdue above target', () => {
    assert.equal(urgencyFromAge(null, 2), 'normal');
    assert.equal(urgencyFromAge(0.5, 2), 'normal');
    assert.equal(urgencyFromAge(1, 2), 'warning');
    assert.equal(urgencyFromAge(2, 2), 'warning');
    assert.equal(urgencyFromAge(2.1, 2), 'overdue');
    // target 1: warning starts at 1 (max(0, 1)), overdue above 1
    assert.equal(urgencyFromAge(0.9, 1), 'normal');
    assert.equal(urgencyFromAge(1, 1), 'warning');
    assert.equal(urgencyFromAge(1.1, 1), 'overdue');
  });
});

describe('visitDayUrgency (frozen CI rule)', () => {
  const now = new Date(2026, 9, 16, 10, 0);
  it('future day normal, same day warning, past day overdue', () => {
    assert.equal(visitDayUrgency(new Date(2026, 9, 17, 8, 0), now), 'normal');
    assert.equal(visitDayUrgency(new Date(2026, 9, 16, 23, 0), now), 'warning');
    assert.equal(visitDayUrgency(new Date(2026, 9, 16, 7, 0), now), 'warning');
    assert.equal(visitDayUrgency(new Date(2026, 9, 15, 23, 59), now), 'overdue');
  });
});

describe('countBuckets', () => {
  it('always returns every key, inactive included', () => {
    const counts = countBuckets(COURRIER_BUCKETS, [{ bucket: 'to_print' }, { bucket: 'inactive' }, { bucket: 'to_print' }]);
    assert.deepEqual(counts, { to_print: 2, with_dg: 0, returned: 0, inactive: 1 });
    assert.deepEqual(Object.keys(countBuckets(DN_CIRCUIT_BUCKETS, [])).sort(), ['inactive', 'returned', 'to_send', 'with_director']);
    assert.deepEqual(Object.keys(countBuckets(FINANCE_BUCKETS, [])).sort(), ['awaiting_applicant', 'done', 'inactive', 'invoice_to_send', 'proof_to_validate']);
    assert.deepEqual(Object.keys(countBuckets(INSPECTION_BUCKETS, [])).sort(), ['awaiting_payment', 'closed', 'inactive', 'to_hold', 'verdict_due']);
  });
});

describe('OPERATIONAL_OWNERS', () => {
  it('is the cockpit OWNERS (one source, unchanged values)', () => {
    assert.equal(OWNERS, OPERATIONAL_OWNERS);
    assert.deepEqual(OPERATIONAL_OWNERS.finance, { kind: 'staff', label: 'Finance', roles: ['s5_agent', 'SU'] });
    assert.deepEqual(OPERATIONAL_OWNERS.inspection, { kind: 'staff', label: 'Cellule Inspection', roles: ['r3_agent', 'SU'] });
    assert.deepEqual(OPERATIONAL_OWNERS.applicant, { kind: 'applicant', label: 'Postulant' });
  });

  type Layer = { handle: (req: Request, res: Response, next: () => void) => void };
  function passes(router: unknown, role: string): boolean {
    let allowed = false;
    const res = { status: () => ({ json: () => undefined }) } as unknown as Response;
    (router as { stack: Layer[] }).stack[1].handle({ user: { userId: 1, roles: [role] } } as unknown as Request, res, () => {
      allowed = true;
    });
    return allowed;
  }
  const ALL = ['dn_agent', 'dn_supervisor', 'reception', 'assistant_dg', 'assistant_dn', 's5_agent', 'r3_agent', 'SU'];

  it('courrier owners carry exactly the courrier route guard roles', () => {
    for (const owner of [OPERATIONAL_OWNERS.reception, OPERATIONAL_OWNERS.assistantDg]) {
      assert.deepEqual(ALL.filter((role) => passes(courrierRoute, role)).sort(), [...owner.roles].sort());
    }
  });

  it('the Assistante DN owner carries exactly the Directeur DN circuit route guard roles', () => {
    assert.deepEqual(ALL.filter((role) => passes(dnAnnotationRoute, role)).sort(), [...OPERATIONAL_OWNERS.assistantDn.roles].sort());
  });
});

describe('canRecordSiteVisitHeld (B4)', () => {
  it('only a scheduled visit whose payment is validated', () => {
    assert.equal(canRecordSiteVisitHeld({ status: 'scheduled' }, { status: 'validated' }), true);
    for (const status of ['awaiting_invoice', 'awaiting_proof', 'pending_validation', 'rejected']) {
      assert.equal(canRecordSiteVisitHeld({ status: 'scheduled' }, { status }), false, status);
    }
    assert.equal(canRecordSiteVisitHeld({ status: 'scheduled' }, null), false);
    assert.equal(canRecordSiteVisitHeld({ status: 'held' }, { status: 'validated' }), false);
  });
});
