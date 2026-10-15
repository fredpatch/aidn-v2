/** SESSION1-MEET-1 - migration 0009 shape. Drizzle applies every pending
 *  migration in ONE transaction; 0009 stays safe because it only CREATES its
 *  enum types (values usable at once) and never ALTERs a pre-existing enum
 *  (55P04, see M1-1). Its hand-written data step must run between the column
 *  creation and the check constraints, and the temporary default must go.
 *  No database needed. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const drizzleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../drizzle');
const FILE = '0009_session1_meet1_meeting_confirmation.sql';
const sql = fs.readFileSync(path.join(drizzleDir, FILE), 'utf8');

function positionOf(fragment: string): number {
  const index = sql.indexOf(fragment);
  assert.ok(index !== -1, `${FILE} lacks: ${fragment}`);
  return index;
}

describe('migration 0009 (meeting confirmation)', () => {
  it('never adds a value to an existing enum', () => {
    assert.doesNotMatch(sql, /ADD VALUE/i);
  });

  it('creates both enum types before using them', () => {
    const created = positionOf('CREATE TYPE "public"."meeting_confirmation_status"');
    assert.ok(created < positionOf(`DEFAULT 'confirmed'`));
    positionOf('CREATE TYPE "public"."meeting_negotiation_event_kind"');
  });

  it('backfills between the column creation and the check constraints, then drops the default', () => {
    const column = positionOf('ADD COLUMN "confirmation_status"');
    const siteVisits = positionOf(`SET "confirmation_status" = 'not_required' WHERE "meeting_type" = 'site_visit'`);
    const confirmedAt = positionOf(`SET "confirmed_at" = "created_at" WHERE "confirmation_status" = 'confirmed'`);
    const dropDefault = positionOf('ALTER COLUMN "confirmation_status" DROP DEFAULT');
    const firstCheck = positionOf('ADD CONSTRAINT "meetings_alternate_coherent_chk"');
    assert.ok(column < siteVisits && siteVisits < confirmedAt && confirmedAt < dropDefault && dropDefault < firstCheck);
  });

  it('is the only migration touching the negotiation types', () => {
    const using = fs
      .readdirSync(drizzleDir)
      .filter((name) => name.endsWith('.sql'))
      .filter((name) => fs.readFileSync(path.join(drizzleDir, name), 'utf8').includes('meeting_confirmation_status'));
    assert.deepEqual(using, [FILE]);
  });
});
