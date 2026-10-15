/** SESSION1-MEET-2 - migration 0010 shape. Drizzle applies every pending
 *  migration in ONE transaction: adding an enum value is safe only while no
 *  statement of the batch uses it (55P04, gotcha #23). 0010 adds the value
 *  and two nullable columns, and backfills nothing. No database needed. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const drizzleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../drizzle');
const FILE = '0010_session1_meet2_signed_report.sql';
const sql = fs.readFileSync(path.join(drizzleDir, FILE), 'utf8');

describe('migration 0010 (signed meeting report)', () => {
  it('adds the owner type value and writes no data', () => {
    assert.match(sql, /ALTER TYPE "public"\."document_owner_type" ADD VALUE 'meeting_report_signed'/);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE)\b/i);
  });

  it('is the only migration mentioning the new owner type', () => {
    const using = fs
      .readdirSync(drizzleDir)
      .filter((name) => name.endsWith('.sql'))
      .filter((name) => fs.readFileSync(path.join(drizzleDir, name), 'utf8').includes('meeting_report_signed'));
    assert.deepEqual(using, [FILE]);
  });

  it('adds both nullable columns, then the coherence check', () => {
    const url = sql.indexOf('ADD COLUMN "signed_cr_document_url" text');
    const at = sql.indexOf('ADD COLUMN "signed_cr_uploaded_at" timestamp');
    const check = sql.indexOf('ADD CONSTRAINT "meetings_signed_cr_coherent_chk"');
    assert.ok(url !== -1 && at !== -1 && check !== -1, 'columns and check present');
    assert.ok(url < check && at < check);
    assert.doesNotMatch(sql, /signed_cr_\w+" \w+ NOT NULL/);
  });

  it('the check ties the signed copy to a DN CR and to M3/M4, not to the meeting status', () => {
    const check = sql.slice(sql.indexOf('meetings_signed_cr_coherent_chk'));
    assert.match(check, /"cr_document_url" IS NOT NULL/);
    assert.match(check, /IN \('preliminary', 'formal'\)/);
    assert.doesNotMatch(check.split(';')[0], /held/);
  });
});
