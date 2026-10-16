/** SESSION1-COCKPIT-1 - batched parameter read: one query, fallbacks for
 *  missing or non-numeric values. Real PostgreSQL (skipped without DATABASE_URL). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('getIntegerValues / loadThresholds (real PostgreSQL)', { skip }, () => {
  let params: typeof import('../system-parameters/system-parameters.service.js');
  let thresholds: typeof import('./thresholds.js');
  let appPool: pg.Pool;
  let close: () => Promise<void>;

  before(async () => {
    params = await import('../system-parameters/system-parameters.service.js');
    thresholds = await import('./thresholds.js');
    const dbModule = await import('../../shared/db/index.js');
    appPool = dbModule.db.$client as pg.Pool;
    close = () => dbModule.db.$client.end();
  });
  after(async () => close());

  async function countQueries<T>(run: () => Promise<T>): Promise<{ count: number; value: T }> {
    const original = appPool.query.bind(appPool);
    let count = 0;
    (appPool as unknown as { query: unknown }).query = (...args: unknown[]) => {
      count += 1;
      return (original as (...a: unknown[]) => unknown)(...args);
    };
    try {
      const value = await run();
      return { count, value };
    } finally {
      (appPool as unknown as { query: unknown }).query = original;
    }
  }

  it('reads several keys in one query and falls back for unknown keys', async () => {
    const { count, value } = await countQueries(() =>
      params.getIntegerValues({ 'cockpit-test-missing-key': 7, dg_circuit_alert_days: 3 })
    );
    assert.equal(value['cockpit-test-missing-key'], 7);
    assert.equal(typeof value.dg_circuit_alert_days, 'number');
    assert.equal(count, 1);
  });

  it('loadThresholds returns the named thresholds', async () => {
    const { value } = await countQueries(() => thresholds.loadThresholds(['invoiceUploadDays', 'paymentValidationDays']));
    assert.deepEqual(Object.keys(value).sort(), ['invoiceUploadDays', 'paymentValidationDays']);
  });
});
