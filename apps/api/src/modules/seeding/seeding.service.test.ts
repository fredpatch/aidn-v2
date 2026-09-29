import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatSeedResult, withSeededFileRollback } from './seeding.service.js';
import { SeedingError } from './seeding.types.js';

describe('withSeededFileRollback', () => {
  function tempFile(name: string): string {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aidn-rollback-')), name);
    fs.writeFileSync(file, 'x');
    return file;
  }

  it('keeps tracked files when the work succeeds', async () => {
    const file = tempFile('kept.docx');

    const result = await withSeededFileRollback(async (track) => {
      track(file);
      return 'ok';
    });

    assert.equal(result, 'ok');
    assert.ok(fs.existsSync(file));
  });

  it('removes tracked files and rethrows the original error when the work fails', async () => {
    const file = tempFile('rolled-back.docx');
    const original = new Error('transaction rolled back');

    await assert.rejects(
      withSeededFileRollback(async (track) => {
        track(file);
        throw original;
      }),
      (error) => error === original
    );
    assert.equal(fs.existsSync(file), false);
  });
});

describe('SeedingError', () => {
  it('names the seed and operation and surfaces the innermost cause', () => {
    const pgError = new Error('canceling statement due to lock timeout');
    const drizzleError = new Error('Failed query: SELECT pg_advisory_xact_lock($1)', {
      cause: pgError,
    });

    const error = new SeedingError('reference-data', 'acquisition of the seeding lock', drizzleError);

    assert.equal(
      error.message,
      'Seed "reference-data" failed during acquisition of the seeding lock: canceling statement due to lock timeout'
    );
    assert.equal(error.cause, drizzleError);
  });
});

describe('formatSeedResult', () => {
  it('summarises counts on one line without listing keys', () => {
    const line = formatSeedResult({
      name: 'system-parameters',
      label: 'System parameters',
      created: 3,
      skipped: 13,
      items: [{ key: 'otp_expiration_minutes', status: 'created' }],
    });

    assert.equal(line, '[seeding] System parameters: 3 created, 13 skipped');
  });
});
