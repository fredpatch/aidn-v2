import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOADS_ROOT } from './uploads-root.js';

test('UPLOADS_ROOT is apps/api/uploads, independent of the working directory', () => {
  assert.equal(path.basename(UPLOADS_ROOT), 'uploads');
  assert.equal(path.basename(path.dirname(UPLOADS_ROOT)), 'api');
  assert.ok(fs.existsSync(path.join(path.dirname(UPLOADS_ROOT), 'package.json')));
});
