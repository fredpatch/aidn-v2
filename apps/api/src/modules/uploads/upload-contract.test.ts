import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** STORAGE-0B guard - business endpoints take only an uploadAssetId; the
 *  address and type of an attached file come from upload_assets. */
const modulesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sources(suffix: string): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  for (const entry of fs.readdirSync(modulesDir, { recursive: true }) as string[]) {
    if (entry.endsWith(suffix) && !entry.endsWith('.test.ts')) {
      const file = path.join(modulesDir, entry);
      out.push({ file: entry, text: fs.readFileSync(file, 'utf8') });
    }
  }
  return out;
}

describe('asset-only attachment contract', () => {
  it('no controller reads a file address or MIME type from the request body', () => {
    const offenders = sources('.controller.ts')
      .filter(({ text }) => /const \{[^}]*\b(fileUrl|mimeType|closureDocumentUrl|closureDocumentMimeType)\b[^}]*\} = req\.body/.test(text))
      .map(({ file }) => file);
    assert.deepEqual(offenders, []);
  });

  it('the unguarded link helper is gone - only the attachment service and the SU relink remain', () => {
    const offenders = sources('.ts')
      .filter(({ text }) => text.includes('linkUploadAssetToOwner'))
      .map(({ file }) => file);
    assert.deepEqual(offenders, []);
    const relinkUsers = sources('.ts')
      .filter(({ text }) => text.includes('linkOrRelinkUploadAsset('))
      .map(({ file }) => file.replace(/\\/g, '/'))
      .sort();
    assert.deepEqual(relinkUsers, ['uploads/uploads.admin.controller.ts', 'uploads/uploads.service.ts']);
  });
});
