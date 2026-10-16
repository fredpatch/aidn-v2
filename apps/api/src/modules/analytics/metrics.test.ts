/** ROLE-ANALYTICS-1B - the analytics helpers moved out of analytics.service.ts
 *  keep their exact behaviour. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { average, daysBetween, inPeriod, median, percent } from './metrics.js';

describe('analytics metrics helpers', () => {
  it('daysBetween: calendar days with one decimal, null when unusable', () => {
    assert.equal(daysBetween('2026-10-01T00:00:00Z', '2026-10-04T12:00:00Z'), 3.5);
    assert.equal(daysBetween(new Date('2026-10-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z')), 0);
    assert.equal(daysBetween('2026-10-01T00:00:00Z', '2026-10-01T02:00:00Z'), 0.1);
    assert.equal(daysBetween(null, '2026-10-01T00:00:00Z'), null);
    assert.equal(daysBetween('2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z'), null);
    assert.equal(daysBetween('not a date', '2026-10-01T00:00:00Z'), null);
  });

  it('average and median ignore null and non-finite values', () => {
    assert.equal(average([1, 2, null, 4]), 2.3);
    assert.equal(average([null, Number.NaN]), null);
    assert.equal(average([]), null);
    assert.equal(median([5, 1, 3]), 3);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([null]), null);
  });

  it('percent rounds and shows "-" for an empty total', () => {
    assert.equal(percent(1, 3), '33%');
    assert.equal(percent(2, 3), '67%');
    assert.equal(percent(0, 0), '-');
  });

  it('inPeriod is inclusive on both ends (global overview semantics)', () => {
    const start = new Date('2026-10-01T00:00:00Z');
    const end = new Date('2026-10-31T23:59:59.999Z');
    assert.equal(inPeriod(start, start, end), true);
    assert.equal(inPeriod(end, start, end), true);
    assert.equal(inPeriod('2026-11-01T00:00:00Z', start, end), false);
    assert.equal(inPeriod(null, start, end), false);
  });
});
