import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import CFB from 'cfb';
import { validateFileContent } from './file-content-validation.js';
import { UploadRejectedError } from './upload-intake.js';

const REAL_DOCX_FIXTURE = path.join(
  import.meta.dirname,
  '../../../seed-assets/document-templates/DN-AIR-R2-3-F-E-011 MATRICE DE CONFORMITE.docx'
);

interface Fixture {
  file: string;
  cleanup: () => void;
}

function write(name: string, content: Buffer | string): Fixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidn-content-validate-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return { file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function buildZip(entries: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [entryName, content] of Object.entries(entries)) {
    zip.addFile(entryName, Buffer.from(content));
  }
  return zip.toBuffer();
}

function buildOle(streamName: string): Buffer {
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, streamName, Buffer.from('fake binary stream content'));
  return CFB.write(cfb, { type: 'buffer' });
}

async function rejectsWithMismatch(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(
    promise,
    (error: unknown) => error instanceof UploadRejectedError && error.code === 'UPLOAD_CONTENT_TYPE_MISMATCH'
  );
}

describe('validateFileContent - PDF', () => {
  it('accepts a real PDF signature', async () => {
    const { file, cleanup } = write('doc.pdf', '%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF');
    try {
      const mime = await validateFileContent({
        filePath: file,
        declaredMime: 'application/pdf',
        originalName: 'doc.pdf',
      });
      assert.equal(mime, 'application/pdf');
    } finally {
      cleanup();
    }
  });

  it('rejects an EXE renamed to .pdf', async () => {
    const { file, cleanup } = write('fake.pdf', Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]));
    try {
      await rejectsWithMismatch(
        validateFileContent({ filePath: file, declaredMime: 'application/pdf', originalName: 'fake.pdf' })
      );
    } finally {
      cleanup();
    }
  });

  it('rejects HTML renamed to .pdf', async () => {
    const { file, cleanup } = write('fake.pdf', '<html><body>not a pdf</body></html>');
    try {
      await rejectsWithMismatch(
        validateFileContent({ filePath: file, declaredMime: 'application/pdf', originalName: 'fake.pdf' })
      );
    } finally {
      cleanup();
    }
  });

  it('rejects a JPEG renamed to .pdf', async () => {
    const { file, cleanup } = write('fake.pdf', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
    try {
      await rejectsWithMismatch(
        validateFileContent({ filePath: file, declaredMime: 'application/pdf', originalName: 'fake.pdf' })
      );
    } finally {
      cleanup();
    }
  });
});

describe('validateFileContent - PNG/JPEG', () => {
  it('accepts a real PNG signature', async () => {
    const { file, cleanup } = write('img.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]));
    try {
      const mime = await validateFileContent({ filePath: file, declaredMime: 'image/png', originalName: 'img.png' });
      assert.equal(mime, 'image/png');
    } finally {
      cleanup();
    }
  });

  it('accepts a real JPEG signature with either alias extension', async () => {
    const { file, cleanup } = write('img.jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]));
    try {
      const mime = await validateFileContent({
        filePath: file,
        declaredMime: 'image/jpeg',
        originalName: 'photo.jpeg',
      });
      assert.equal(mime, 'image/jpeg');
    } finally {
      cleanup();
    }
  });

  it('rejects a PNG declared+named as JPEG', async () => {
    const { file, cleanup } = write('img.jpg', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    try {
      await rejectsWithMismatch(
        validateFileContent({ filePath: file, declaredMime: 'image/jpeg', originalName: 'img.jpg' })
      );
    } finally {
      cleanup();
    }
  });

  it('rejects valid PDF bytes declared as image/png', async () => {
    const { file, cleanup } = write('doc.png', '%PDF-1.4');
    try {
      await rejectsWithMismatch(
        validateFileContent({ filePath: file, declaredMime: 'image/png', originalName: 'doc.png' })
      );
    } finally {
      cleanup();
    }
  });

  it('rejects valid PDF bytes with a .png extension declared as application/pdf', async () => {
    const { file, cleanup } = write('doc.png', '%PDF-1.4');
    try {
      await rejectsWithMismatch(
        validateFileContent({ filePath: file, declaredMime: 'application/pdf', originalName: 'doc.png' })
      );
    } finally {
      cleanup();
    }
  });
});

describe('validateFileContent - legacy DOC', () => {
  it('accepts an OLE container exposing the WordDocument stream', async () => {
    const { file, cleanup } = write('report.doc', buildOle('WordDocument'));
    try {
      const mime = await validateFileContent({
        filePath: file,
        declaredMime: 'application/msword',
        originalName: 'report.doc',
      });
      assert.equal(mime, 'application/msword');
    } finally {
      cleanup();
    }
  });

  it('rejects random binary named .doc (no OLE signature at all)', async () => {
    const { file, cleanup } = write('fake.doc', 'just some random bytes, not a compound file');
    try {
      await rejectsWithMismatch(
        validateFileContent({ filePath: file, declaredMime: 'application/msword', originalName: 'fake.doc' })
      );
    } finally {
      cleanup();
    }
  });

  it('rejects an OLE container that is not Word (Excel Workbook identity)', async () => {
    const { file, cleanup } = write('renamed.doc', buildOle('Workbook'));
    try {
      await rejectsWithMismatch(
        validateFileContent({ filePath: file, declaredMime: 'application/msword', originalName: 'renamed.doc' })
      );
    } finally {
      cleanup();
    }
  });

  it('rejects an OLE container that is not Word (PowerPoint identity)', async () => {
    const { file, cleanup } = write('renamed.doc', buildOle('PowerPoint Document'));
    try {
      await rejectsWithMismatch(
        validateFileContent({ filePath: file, declaredMime: 'application/msword', originalName: 'renamed.doc' })
      );
    } finally {
      cleanup();
    }
  });
});

describe('validateFileContent - DOCX', () => {
  it('accepts a real Word/LibreOffice-produced DOCX', async () => {
    const mime = await validateFileContent({
      filePath: REAL_DOCX_FIXTURE,
      declaredMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      originalName: 'matrice.docx',
    });
    assert.equal(mime, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('rejects a random ZIP (not OOXML at all)', async () => {
    const { file, cleanup } = write('random.docx', buildZip({ 'hello.txt': 'just a plain zip entry' }));
    try {
      await rejectsWithMismatch(
        validateFileContent({
          filePath: file,
          declaredMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          originalName: 'random.docx',
        })
      );
    } finally {
      cleanup();
    }
  });

  it('rejects a ZIP missing word/document.xml', async () => {
    const { file, cleanup } = write('incomplete.docx', buildZip({ '[Content_Types].xml': '<Types/>' }));
    try {
      await rejectsWithMismatch(
        validateFileContent({
          filePath: file,
          declaredMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          originalName: 'incomplete.docx',
        })
      );
    } finally {
      cleanup();
    }
  });

  it('rejects an XLSX-shaped ZIP renamed to .docx', async () => {
    const { file, cleanup } = write(
      'spreadsheet.docx',
      buildZip({ '[Content_Types].xml': '<Types/>', 'xl/workbook.xml': '<workbook/>' })
    );
    try {
      await rejectsWithMismatch(
        validateFileContent({
          filePath: file,
          declaredMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          originalName: 'spreadsheet.docx',
        })
      );
    } finally {
      cleanup();
    }
  });

  it('rejects a DOCX-shaped archive containing word/vbaProject.bin', async () => {
    const { file, cleanup } = write(
      'macro.docx',
      buildZip({
        '[Content_Types].xml': '<Types/>',
        'word/document.xml': '<document/>',
        'word/vbaProject.bin': 'fake macro bytes',
      })
    );
    try {
      await rejectsWithMismatch(
        validateFileContent({
          filePath: file,
          declaredMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          originalName: 'macro.docx',
        })
      );
    } finally {
      cleanup();
    }
  });

  it('rejects a corrupt ZIP', async () => {
    const { file, cleanup } = write('corrupt.docx', 'not a zip at all, just garbage bytes that keep going');
    try {
      await rejectsWithMismatch(
        validateFileContent({
          filePath: file,
          declaredMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          originalName: 'corrupt.docx',
        })
      );
    } finally {
      cleanup();
    }
  });
});

describe('validateFileContent - metadata agreement', () => {
  it('rejects a declared MIME outside the accepted set', async () => {
    const { file, cleanup } = write('whatever.bin', '%PDF-1.4');
    try {
      await rejectsWithMismatch(
        validateFileContent({ filePath: file, declaredMime: 'application/octet-stream', originalName: 'whatever.bin' })
      );
    } finally {
      cleanup();
    }
  });

  it('rejects a valid DOCX renamed with a .doc extension under application/msword', async () => {
    await rejectsWithMismatch(
      validateFileContent({
        filePath: REAL_DOCX_FIXTURE,
        declaredMime: 'application/msword',
        originalName: 'matrice-as.doc',
      })
    );
  });
});
