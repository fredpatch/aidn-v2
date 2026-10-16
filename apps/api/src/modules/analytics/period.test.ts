/** ROLE-ANALYTICS-1B - Libreville periods as half-open UTC ranges. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveAnalyticsPeriod } from './period.js';

// 2026-10-16 10:00 Libreville (09:00 UTC).
const NOW = new Date('2026-10-16T09:00:00Z');

function invalid(input: Parameters<typeof resolveAnalyticsPeriod>[0], now = NOW) {
  assert.throws(() => resolveAnalyticsPeriod(input, now), /INVALID_ANALYTICS_PERIOD/);
}

describe('resolveAnalyticsPeriod', () => {
  it('today: Libreville midnight to next midnight, in UTC', () => {
    assert.deepEqual(resolveAnalyticsPeriod({ period: 'today' }, NOW), {
      preset: 'today',
      start: '2026-10-15T23:00:00.000Z',
      end: '2026-10-16T23:00:00.000Z',
      timeZone: 'Africa/Libreville',
      displayFrom: '2026-10-16',
      displayTo: '2026-10-16',
    });
  });

  it('today follows the Libreville date, not the UTC date, around midnight', () => {
    // 23:30 UTC on the 16th is already 00:30 on the 17th in Libreville.
    const p = resolveAnalyticsPeriod({ period: 'today' }, new Date('2026-10-16T23:30:00Z'));
    assert.equal(p.displayFrom, '2026-10-17');
    assert.equal(p.start, '2026-10-16T23:00:00.000Z');
    // 22:59 UTC on the 16th is still the 16th.
    assert.equal(resolveAnalyticsPeriod({ period: 'today' }, new Date('2026-10-16T22:59:59Z')).displayFrom, '2026-10-16');
  });

  it('last_7_days and last_30_days include today', () => {
    const week = resolveAnalyticsPeriod({ period: 'last_7_days' }, NOW);
    assert.equal(week.displayFrom, '2026-10-10');
    assert.equal(week.displayTo, '2026-10-16');
    assert.equal(week.start, '2026-10-09T23:00:00.000Z');
    assert.equal(week.end, '2026-10-16T23:00:00.000Z');
    const month = resolveAnalyticsPeriod({ period: 'last_30_days' }, NOW);
    assert.equal(month.displayFrom, '2026-09-17');
    assert.equal(month.displayTo, '2026-10-16');
  });

  it('this_month and previous_month cover whole Libreville months', () => {
    assert.deepEqual(resolveAnalyticsPeriod({ period: 'this_month' }, NOW), {
      preset: 'this_month',
      start: '2026-09-30T23:00:00.000Z',
      end: '2026-10-31T23:00:00.000Z',
      timeZone: 'Africa/Libreville',
      displayFrom: '2026-10-01',
      displayTo: '2026-10-31',
    });
    const previous = resolveAnalyticsPeriod({ period: 'previous_month' }, NOW);
    assert.equal(previous.start, '2026-08-31T23:00:00.000Z');
    assert.equal(previous.end, '2026-09-30T23:00:00.000Z');
    assert.equal(previous.displayTo, '2026-09-30');
  });

  it('month boundary: the first Libreville hour of a month already belongs to it', () => {
    // 2026-10-31 23:15 UTC = 2026-11-01 00:15 Libreville.
    const p = resolveAnalyticsPeriod({ period: 'this_month' }, new Date('2026-10-31T23:15:00Z'));
    assert.equal(p.displayFrom, '2026-11-01');
    assert.equal(p.displayTo, '2026-11-30');
  });

  it('year boundary: previous_month in January is December of the previous year', () => {
    const p = resolveAnalyticsPeriod({ period: 'previous_month' }, new Date('2027-01-05T12:00:00Z'));
    assert.equal(p.displayFrom, '2026-12-01');
    assert.equal(p.displayTo, '2026-12-31');
    assert.equal(p.start, '2026-11-30T23:00:00.000Z');
    assert.equal(p.end, '2026-12-31T23:00:00.000Z');
    // 2026-12-31 23:30 UTC is already 2027 in Libreville.
    assert.equal(resolveAnalyticsPeriod({ period: 'today' }, new Date('2026-12-31T23:30:00Z')).displayFrom, '2027-01-01');
  });

  it('leap year: February 2028 has 29 days', () => {
    const p = resolveAnalyticsPeriod({ period: 'this_month' }, new Date('2028-02-10T12:00:00Z'));
    assert.equal(p.displayTo, '2028-02-29');
    assert.equal(resolveAnalyticsPeriod({ period: 'custom', from: '2028-02-29', to: '2028-02-29' }, NOW).displayFrom, '2028-02-29');
    invalid({ period: 'custom', from: '2027-02-29', to: '2027-03-01' });
  });

  it('custom single day and multi-day ranges are inclusive', () => {
    assert.deepEqual(resolveAnalyticsPeriod({ period: 'custom', from: '2026-10-05', to: '2026-10-05' }, NOW), {
      preset: 'custom',
      start: '2026-10-04T23:00:00.000Z',
      end: '2026-10-05T23:00:00.000Z',
      timeZone: 'Africa/Libreville',
      displayFrom: '2026-10-05',
      displayTo: '2026-10-05',
    });
    const multi = resolveAnalyticsPeriod({ period: 'custom', from: '2026-09-28', to: '2026-10-03' }, NOW);
    assert.equal(multi.start, '2026-09-27T23:00:00.000Z');
    assert.equal(multi.end, '2026-10-03T23:00:00.000Z');
  });

  it('a custom range of exactly 366 days is accepted, 367 is not', () => {
    assert.equal(resolveAnalyticsPeriod({ period: 'custom', from: '2025-01-01', to: '2026-01-01' }, NOW).displayTo, '2026-01-01');
    invalid({ period: 'custom', from: '2025-01-01', to: '2026-01-02' });
  });

  it('rejects invalid input', () => {
    invalid({});
    invalid({ period: 'yesterday' });
    invalid({ period: 'custom' });
    invalid({ period: 'custom', from: '2026-10-01' });
    invalid({ period: 'custom', from: '2026-10-01', to: 20261002 });
    invalid({ period: 'custom', from: '2026-1-01', to: '2026-10-02' });
    invalid({ period: 'custom', from: '2026-10-01T00:00', to: '2026-10-02' });
    invalid({ period: 'custom', from: '2026-02-30', to: '2026-03-02' });
    invalid({ period: 'custom', from: '2026-10-05', to: '2026-10-04' });
  });

  it('the server time zone never changes the result', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const moduleUrl = pathToFileURL(path.join(dir, 'period.ts')).href;
    const script = `const { resolveAnalyticsPeriod } = await import(${JSON.stringify(moduleUrl)});
      const now = new Date('2026-10-31T23:15:00Z');
      console.log(JSON.stringify(['today', 'this_month', 'previous_month', 'last_7_days']
        .map((period) => resolveAnalyticsPeriod({ period }, now))));`;
    const run = (tz: string) =>
      execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
        env: { ...process.env, TZ: tz },
        encoding: 'utf8',
      }).trim();
    const reference = run('Africa/Libreville');
    assert.equal(run('Pacific/Kiritimati'), reference);
    assert.equal(run('America/Los_Angeles'), reference);
    assert.equal(JSON.parse(reference)[0].displayFrom, '2026-11-01');
  });
});
