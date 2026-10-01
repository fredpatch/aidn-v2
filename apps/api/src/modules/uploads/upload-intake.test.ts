import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';
import {
  acceptsUploadMime,
  discardUploadedFile,
  registerReceivedFile,
  uploadRejection,
  UploadRejectedError,
} from './upload-intake.js';

function tempFile(content = 'x'): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidn-intake-'));
  const file = path.join(dir, 'upload.pdf');
  fs.writeFileSync(file, content);
  return { dir, file };
}

describe('acceptsUploadMime', () => {
  it('accepts the document types and nothing else', () => {
    for (const mime of ['application/pdf', 'application/msword', 'image/png', 'image/jpeg',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document']) {
      assert.equal(acceptsUploadMime(mime), true, mime);
    }
    for (const mime of ['text/html', 'image/svg+xml', 'application/zip', '']) {
      assert.equal(acceptsUploadMime(mime), false, mime);
    }
  });
});

describe('uploadRejection', () => {
  it('maps an oversized file to 413', () => {
    assert.deepEqual(uploadRejection(new multer.MulterError('LIMIT_FILE_SIZE')), {
      status: 413,
      message: 'Fichier trop volumineux (20 Mo maximum).',
      code: 'UPLOAD_TOO_LARGE',
    });
  });

  it('maps other Multer errors to a generic 400', () => {
    assert.equal(uploadRejection(new multer.MulterError('LIMIT_UNEXPECTED_FILE'))?.status, 400);
  });

  it('maps a refused type to 400 with the accepted formats', () => {
    assert.deepEqual(uploadRejection(new UploadRejectedError('UPLOAD_TYPE_NOT_ACCEPTED')), {
      status: 400,
      message: 'Type de fichier non accepte. Formats acceptes : PDF, Word, PNG, JPG.',
      code: 'UPLOAD_TYPE_NOT_ACCEPTED',
    });
  });

  it('leaves unrelated errors to the normal error path', () => {
    assert.equal(uploadRejection(new Error('boom')), null);
  });

  it('maps a content/type mismatch to 400', () => {
    assert.deepEqual(uploadRejection(new UploadRejectedError('UPLOAD_CONTENT_TYPE_MISMATCH')), {
      status: 400,
      message: 'Le contenu du fichier ne correspond pas au type declare. Merci de verifier le fichier.',
      code: 'UPLOAD_CONTENT_TYPE_MISMATCH',
    });
  });
});

describe('discardUploadedFile', () => {
  it('deletes the file and ignores one that is already gone', async () => {
    const { dir, file } = tempFile();
    try {
      await discardUploadedFile(file);
      assert.equal(fs.existsSync(file), false);
      await discardUploadedFile(file);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('registerReceivedFile', () => {
  it('returns the registered asset and keeps the file', async () => {
    const { dir, file } = tempFile();
    try {
      const result = await registerReceivedFile({ path: file, size: 1 }, async () => ({ id: 9 }));
      assert.deepEqual(result, { id: 9 });
      assert.equal(fs.existsSync(file), true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a zero-byte file and deletes it without registering', async () => {
    const { dir, file } = tempFile('');
    let registered = false;
    try {
      await assert.rejects(
        registerReceivedFile({ path: file, size: 0 }, async () => ((registered = true), { id: 1 })),
        (error: unknown) => error instanceof UploadRejectedError && error.code === 'UPLOAD_EMPTY'
      );
      assert.equal(registered, false);
      assert.equal(fs.existsSync(file), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('deletes the file when the asset insert fails, and rethrows', async () => {
    const { dir, file } = tempFile();
    try {
      await assert.rejects(
        registerReceivedFile({ path: file, size: 1 }, async () => {
          throw new Error('insert failed');
        }),
        { message: 'insert failed' }
      );
      assert.equal(fs.existsSync(file), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('maps an empty file to a 400', () => {
    assert.equal(uploadRejection(new UploadRejectedError('UPLOAD_EMPTY'))?.status, 400);
  });
});
