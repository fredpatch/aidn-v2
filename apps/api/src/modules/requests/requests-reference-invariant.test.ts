/** STORAGE-1B invariant - requests.reference is generated once (see the
 *  comment on generateRequestReference in requests.helpers.ts) and used
 *  verbatim as the dossier folder name by relocate-asset.ts. If any code
 *  path ever started updating it, every already-relocated file's canonical
 *  path would silently orphan. There is no DB trigger enforcing this in this
 *  slice (approved decision) - this static check is the guardrail: it scans
 *  every `.update(requests).set({...})` call in the API source and fails if
 *  `reference` ever appears as a set column. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) yield full;
  }
}

/** Finds every `.update(requests)` call and captures the `.set({...})`
 *  object literal that follows it (balanced-brace scan, tolerant of nested
 *  objects like `{ scopeDetails: {...} }` elsewhere in the file). */
function findUpdateRequestsSetBlocks(source: string): string[] {
  const blocks: string[] = [];
  const updateRe = /\.update\(requests\)/g;
  let match: RegExpExecArray | null;
  while ((match = updateRe.exec(source))) {
    const setIdx = source.indexOf('.set(', match.index);
    if (setIdx === -1 || setIdx - match.index > 200) continue; // not the same chain
    const braceStart = source.indexOf('{', setIdx);
    if (braceStart === -1) continue;
    let depth = 0;
    let i = braceStart;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    blocks.push(source.slice(braceStart, i + 1));
  }
  return blocks;
}

describe('requests.reference immutability invariant', () => {
  it('no `.update(requests).set({...})` call anywhere in the API sets `reference`', () => {
    const offenders: string[] = [];
    for (const file of walk(srcRoot)) {
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes('.update(requests)')) continue;
      for (const block of findUpdateRequestsSetBlocks(source)) {
        // Match `reference:` or `reference,` as an object key, not merely the
        // substring (e.g. avoid false negatives/positives from comments).
        if (/(^|[{,\s])reference\s*[:,]/.test(block)) {
          offenders.push(`${path.relative(srcRoot, file)}: ${block.replace(/\s+/g, ' ').slice(0, 120)}`);
        }
      }
    }
    assert.deepEqual(offenders, [], `requests.reference must never be set by an UPDATE:\n${offenders.join('\n')}`);
  });

  it('sanity check: the scanner actually finds the known update(requests) call sites', () => {
    let sitesFound = 0;
    for (const file of walk(srcRoot)) {
      const source = fs.readFileSync(file, 'utf8');
      sitesFound += findUpdateRequestsSetBlocks(source).length;
    }
    // At the time this test was written there were 10 such call sites across
    // the codebase (status/rejectionReason/updatedAt only) - this guards
    // against the balanced-brace scanner silently finding zero and the first
    // assertion passing vacuously.
    assert.ok(sitesFound >= 5, `expected to find several update(requests) call sites, found ${sitesFound}`);
  });
});
