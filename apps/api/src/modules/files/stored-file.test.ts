import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { storageKeyForAddress, storedFileExistsIn } from './stored-file.js';

describe('storageKeyForAddress', () => {
  const keys = new Map([[183, '2026/09/25/admin/misc/a.pdf']]);

  it('resolves a stable address through its asset', () => {
    assert.equal(storageKeyForAddress('/api/files/183', keys), '2026/09/25/admin/misc/a.pdf');
    assert.equal(storageKeyForAddress('/api/files/184', keys), null);
  });

  it('still understands a legacy /uploads address during the transition', () => {
    assert.equal(storageKeyForAddress('/uploads/2026/01/x.pdf', keys), '2026/01/x.pdf');
  });

  it('returns null for anything else', () => {
    for (const value of [null, '', 'https://x/y.pdf', '/api/files/abc']) {
      assert.equal(storageKeyForAddress(value, keys), null, String(value));
    }
  });
});

describe('storedFileExistsIn', () => {
  it('checks the file inside the root and refuses escapes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidn-stored-'));
    try {
      fs.mkdirSync(path.join(root, 'a'), { recursive: true });
      fs.writeFileSync(path.join(root, 'a', 'f.pdf'), 'x');
      assert.equal(storedFileExistsIn(root, 'a/f.pdf'), true);
      assert.equal(storedFileExistsIn(root, 'a/g.pdf'), false);
      assert.equal(storedFileExistsIn(root, '../outside.pdf'), false);
      assert.equal(storedFileExistsIn(root, null), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
