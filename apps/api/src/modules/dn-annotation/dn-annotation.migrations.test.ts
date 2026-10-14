/** SESSION1-M1-1 - drizzle applies all pending migrations in one transaction and
 *  PostgreSQL refuses to use an enum value added in that same transaction (55P04).
 *  So the value `dn_director_annotation` may appear in the migration that adds it
 *  and nowhere else: data steps belong to the backfill script. No database needed. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const drizzleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../drizzle');
const sqlFiles = fs.readdirSync(drizzleDir).filter((name) => name.endsWith('.sql')).sort();
const VALUE = 'dn_director_annotation';

describe('dn_director_annotation enum value in migrations', () => {
  it('is added by exactly one migration, and only added there (ADD VALUE, no INSERT/UPDATE)', () => {
    const using = sqlFiles.filter((name) => fs.readFileSync(path.join(drizzleDir, name), 'utf8').includes(VALUE));
    assert.deepEqual(using, ['0008_session1_m1_dn_director_annotation_enum.sql']);
    const sql = fs.readFileSync(path.join(drizzleDir, using[0]), 'utf8');
    assert.match(sql, /ADD VALUE 'dn_director_annotation'/);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE)\b/i);
  });
});
