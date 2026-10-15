/** SESSION1-MEET-1 - the confirmation policy lives in meetings/ (and the
 *  shared constants). Other API modules call meeting-confirmation.ts instead
 *  of comparing confirmation literals themselves. Static check. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ALLOWED_DIRS = [path.join(srcRoot, 'modules', 'meetings'), path.join(srcRoot, 'shared', 'db')];
const FORBIDDEN = /confirmationStatus\s*[!=]==|'awaiting_applicant'|'awaiting_dn'|'not_required'/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.includes('.test.') ? [full] : [];
  });
}

describe('confirmation literals stay in the meetings module', () => {
  it('no other API module compares confirmation statuses directly', () => {
    const offenders = sourceFiles(srcRoot)
      .filter((file) => !ALLOWED_DIRS.some((allowed) => file.startsWith(allowed)))
      .filter((file) => !file.includes(`${path.sep}scripts${path.sep}`))
      .filter((file) => FORBIDDEN.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(srcRoot, file));
    assert.deepEqual(offenders, []);
  });
});
