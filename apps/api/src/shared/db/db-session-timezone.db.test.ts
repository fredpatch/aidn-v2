/** ROLE-ANALYTICS-1B - app sessions run in UTC whatever the server default.
 *  A non-UTC default is forced through PGOPTIONS (read by pg when a config
 *  sets no `options`), so the test does not depend on the machine: without
 *  the pin, a `defaultNow()` column drifts from `new Date()` by +14 h. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';
const FORCED_ZONE = 'Pacific/Kiritimati'; // UTC+14, no DST
const TOLERANCE_MS = 5_000;

describe('DB session time zone (real PostgreSQL)', { skip }, () => {
  const savedPgOptions = process.env.PGOPTIONS;
  let appDb: typeof import('./index.js');
  let schema: typeof import('./schema.js');
  const probeIds: number[] = [];

  before(async () => {
    process.env.PGOPTIONS = `-c TimeZone=${FORCED_ZONE}`;
    appDb = await import('./index.js');
    schema = await import('./schema.js');
  });

  after(async () => {
    const { inArray } = await import('drizzle-orm');
    if (probeIds.length) await appDb.db.delete(schema.auditLogs).where(inArray(schema.auditLogs.id, probeIds));
    await appDb.db.$client.end();
    if (savedPgOptions === undefined) delete process.env.PGOPTIONS;
    else process.env.PGOPTIONS = savedPgOptions;
  });

  it('control: a pool without the pin follows the forced zone and drifts', async () => {
    const raw = new pg.Pool({ connectionString: DATABASE_URL });
    try {
      const { rows } = await raw.query(
        `SELECT current_setting('TimeZone') AS tz, extract(epoch FROM (localtimestamp - (now() AT TIME ZONE 'UTC'))) AS drift`
      );
      assert.equal(rows[0].tz, FORCED_ZONE);
      assert.ok(Number(rows[0].drift) > 13 * 3600, 'the forced zone must shift DB-local timestamps');
    } finally {
      await raw.end();
    }
  });

  it('the app pool is pinned to UTC', async () => {
    const { rows } = await appDb.db.$client.query(`SELECT current_setting('TimeZone') AS tz`);
    assert.equal(rows[0].tz, 'UTC');
  });

  it('a defaultNow() column and an app-written new Date() of the same insert agree', async () => {
    const appWrittenAt = new Date();
    const [row] = await appDb.db
      .insert(schema.auditLogs)
      .values({ action: 'TZ_PROBE', module: 'TEST', details: { appWrittenAt: appWrittenAt.toISOString() } })
      .returning();
    probeIds.push(row.id);
    const drift = Math.abs(row.createdAt.getTime() - appWrittenAt.getTime());
    assert.ok(drift < TOLERANCE_MS, `created_at drifts by ${drift} ms from the app clock`);
  });
});
