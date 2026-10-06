/** Reschedule invariant for site visits (M6).
 *  rescheduleMeeting() keeps the old row with status 'rescheduled' and inserts
 *  a new one. Any query that selects "the" site visit of a phase or an agent
 *  must therefore exclude 'rescheduled', otherwise it can pick the superseded
 *  row: the former R3 kept access, the current R3 could not submit the avis,
 *  queues and the R3 dashboard listed the dossier twice (fixed in H1).
 *  Static check, no database needed: every `.where(...)` that filters on
 *  meetingType 'site_visit' must also exclude 'rescheduled' - unless it
 *  targets one meeting by id. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const modulesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['site-inspection/site-inspection.service.ts', 'dashboard/dashboard.service.ts'];
const SITE_VISIT = "eq(meetings.meetingType, 'site_visit')";

/** The full `.where( ... )` argument that contains `index`. */
function enclosingWhere(source: string, index: number): string | null {
  const start = source.lastIndexOf('.where(', index);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start + '.where'.length; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return i >= index ? source.slice(start, i + 1) : null;
    }
  }
  return null;
}

describe('site-visit queries exclude superseded (rescheduled) rows', () => {
  for (const file of FILES) {
    it(file, () => {
      const source = fs.readFileSync(path.join(modulesRoot, file), 'utf8');
      let found = 0;
      for (let i = source.indexOf(SITE_VISIT); i !== -1; i = source.indexOf(SITE_VISIT, i + 1)) {
        const where = enclosingWhere(source, i);
        assert.ok(where, `${file}: site_visit filter outside a .where() at offset ${i}`);
        found++;
        if (where.includes('eq(meetings.id,')) continue; // one meeting by id: no ambiguity
        assert.ok(
          where.includes("ne(meetings.status, 'rescheduled')"),
          `${file}: a site_visit query does not exclude 'rescheduled':\n${where}`
        );
      }
      assert.ok(found > 0, `${file}: no site_visit query found - update this test if the code moved`);
    });
  }
});
