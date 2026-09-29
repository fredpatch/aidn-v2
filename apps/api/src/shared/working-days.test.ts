import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkingDay,
  parsePublicHolidays,
  subtractWorkingDays,
  workingDaysBetween,
  type PublicHolidays,
} from '@aidn/shared';

const NONE: PublicHolidays = parsePublicHolidays('').holidays;
// Libreville is UTC+1 all year: 09:00Z = 10:00 local.
const FRI = new Date('2026-09-25T09:00:00Z');
const MON = new Date('2026-09-28T09:00:00Z');
const TUE = new Date('2026-09-29T09:00:00Z');
const THU = new Date('2026-10-01T09:00:00Z');

describe('parsePublicHolidays', () => {
  it('accepts dated (YYYY-MM-DD) and every-year (MM-DD) entries with any separator', () => {
    const { holidays, invalid } = parsePublicHolidays('2026-04-06, 08-17\n2026-05-25; 12-25  02-29');
    assert.deepEqual(invalid, []);
    assert.deepEqual([...holidays.dated], ['2026-04-06', '2026-05-25']);
    assert.deepEqual([...holidays.everyYear], ['08-17', '12-25', '02-29']);
  });

  it('reports entries that are not real dates', () => {
    const { invalid } = parsePublicHolidays('2026-02-30, 13-01, abc, 2026-4-6, 2026-04-06');
    assert.deepEqual(invalid, ['2026-02-30', '13-01', 'abc', '2026-4-6']);
  });

  it('treats an empty value as no holidays', () => {
    const { holidays, invalid } = parsePublicHolidays('   ');
    assert.deepEqual(invalid, []);
    assert.equal(holidays.dated.size + holidays.everyYear.size, 0);
  });
});

describe('isWorkingDay', () => {
  it('is Monday to Friday', () => {
    assert.equal(isWorkingDay(FRI, NONE), true);
    assert.equal(isWorkingDay(new Date('2026-09-26T09:00:00Z'), NONE), false);
    assert.equal(isWorkingDay(new Date('2026-09-27T09:00:00Z'), NONE), false);
    assert.equal(isWorkingDay(MON, NONE), true);
  });

  it('uses the Libreville calendar day, not UTC', () => {
    // Friday 23:30Z is already Saturday 00:30 in Libreville.
    assert.equal(isWorkingDay(new Date('2026-09-25T23:30:00Z'), NONE), false);
    // Sunday 23:30Z is already Monday 00:30 in Libreville.
    assert.equal(isWorkingDay(new Date('2026-09-27T23:30:00Z'), NONE), true);
  });

  it('skips dated and every-year public holidays', () => {
    const { holidays } = parsePublicHolidays('2026-09-28, 08-17');
    assert.equal(isWorkingDay(MON, holidays), false);
    assert.equal(isWorkingDay(new Date('2027-08-17T09:00:00Z'), holidays), false);
    assert.equal(isWorkingDay(new Date('2027-08-18T09:00:00Z'), holidays), true);
  });
});

describe('workingDaysBetween', () => {
  it('does not count the weekend', () => {
    assert.equal(workingDaysBetween(FRI, MON, NONE), 1);
    assert.equal(workingDaysBetween(MON, THU, NONE), 3);
  });

  it('does not count a public holiday', () => {
    const { holidays } = parsePublicHolidays('2026-09-28');
    assert.equal(workingDaysBetween(FRI, TUE, holidays), 1);
  });

  it('counts partial working days', () => {
    assert.equal(workingDaysBetween(MON, new Date('2026-09-28T21:00:00Z'), NONE), 0.5);
  });

  it('is zero when the end is not after the start', () => {
    assert.equal(workingDaysBetween(MON, MON, NONE), 0);
    assert.equal(workingDaysBetween(MON, FRI, NONE), 0);
  });
});

describe('subtractWorkingDays', () => {
  it('steps back over the weekend', () => {
    assert.equal(subtractWorkingDays(MON, 1, NONE).toISOString(), FRI.toISOString());
  });

  it('steps back over a public holiday', () => {
    const { holidays } = parsePublicHolidays('2026-09-28');
    assert.equal(subtractWorkingDays(TUE, 1, holidays).toISOString(), FRI.toISOString());
  });

  it('agrees with workingDaysBetween: sent before the cutoff <=> more than N working days elapsed', () => {
    const { holidays } = parsePublicHolidays('2026-09-28, 12-25');
    const now = new Date('2026-10-02T14:20:00Z');
    for (const n of [1, 3, 5]) {
      const cutoff = subtractWorkingDays(now, n, holidays);
      for (let h = 0; h < 24 * 14; h += 1) {
        const sentAt = new Date(now.getTime() - h * 3_600_000 - 17 * 60_000);
        const beforeCutoff = sentAt.getTime() < cutoff.getTime();
        const elapsed = workingDaysBetween(sentAt, now, holidays);
        assert.equal(beforeCutoff, elapsed > n, `n=${n} sentAt=${sentAt.toISOString()} elapsed=${elapsed}`);
      }
    }
  });
});
