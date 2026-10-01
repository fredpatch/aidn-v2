/** FILE-CONTENT-VALIDATION - a declared MIME + extension is not evidence of
 *  what a file actually contains (STORAGE-0B's Multer fileFilter only ever
 *  checked the browser-supplied MIME string). This module is the one place
 *  that inspects the bytes Multer already wrote to the staging file, for
 *  exactly the five types in ACCEPTED_DOCUMENT_MIME_TYPES - content/type
 *  validation only, not malware scanning: a structurally valid PDF/DOC/DOCX
 *  carrying an exploit or malicious macro is out of scope and passes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import CFB from 'cfb';
import { UploadRejectedError } from './upload-intake.js';

export interface ValidateFileContentParams {
  filePath: string;
  declaredMime: string;
  originalName: string;
}

function rejectMismatch(): never {
  throw new UploadRejectedError('UPLOAD_CONTENT_TYPE_MISMATCH');
}

/** Node fs error codes that mean "we could not read our own staging file",
 *  not "the content doesn't match" - these must surface as a genuine server
 *  error, never as a user-facing content rejection. */
function isInfrastructureError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === 'ENOENT' || code === 'EACCES' || code === 'EPERM' || code === 'EISDIR' || code === 'EMFILE';
}

async function readPrefix(filePath: string, length: number): Promise<Buffer> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

const PDF_SIGNATURE = Buffer.from('%PDF-', 'latin1');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

async function isPdf(filePath: string): Promise<boolean> {
  const prefix = await readPrefix(filePath, PDF_SIGNATURE.length);
  return prefix.equals(PDF_SIGNATURE);
}

async function isPng(filePath: string): Promise<boolean> {
  const prefix = await readPrefix(filePath, PNG_SIGNATURE.length);
  return prefix.equals(PNG_SIGNATURE);
}

async function isJpeg(filePath: string): Promise<boolean> {
  const prefix = await readPrefix(filePath, JPEG_SIGNATURE.length);
  return prefix.equals(JPEG_SIGNATURE);
}

/** A generic OLE Compound File signature alone doesn't say "Word" - XLS,
 *  PPT, MSG and others share the exact same 8-byte signature. The directory
 *  stream named "WordDocument" is Word's own identity; Excel uses
 *  "Workbook"/"Book", PowerPoint uses "PowerPoint Document" - neither is
 *  accepted here. */
async function isWordOle(filePath: string): Promise<boolean> {
  const prefix = await readPrefix(filePath, OLE_SIGNATURE.length);
  if (!prefix.equals(OLE_SIGNATURE)) return false;

  const buffer = await fs.readFile(filePath);
  const container = CFB.read(buffer, { type: 'buffer' });
  const streamNames = container.FullPaths.map((fullPath: string) => fullPath.split('/').pop());
  return streamNames.includes('WordDocument');
}

/** A bare "PK" signature only proves "some ZIP" - a renamed arbitrary
 *  archive, or any other OOXML document (XLSX, PPTX), shares it. DOCX's own
 *  identity is the presence of both required parts; a macro-enabled archive
 *  (word/vbaProject.bin) is rejected outright since .docm was never in the
 *  accepted allowlist and must not be let in silently under the plain .docx
 *  MIME. Entry *names* are read from the ZIP's own metadata, never
 *  extracted/decompressed. */
async function isDocx(filePath: string): Promise<boolean> {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();
  if (entries.length === 0) return false;

  const names = new Set(entries.map((entry) => entry.entryName));
  if (!names.has('[Content_Types].xml') || !names.has('word/document.xml')) return false;
  if (names.has('word/vbaProject.bin')) return false;
  return true;
}

interface FormatValidator {
  extensions: string[];
  canonicalMime: string;
  test: (filePath: string) => Promise<boolean>;
}

const VALIDATORS: Record<string, FormatValidator> = {
  'application/pdf': { extensions: ['.pdf'], canonicalMime: 'application/pdf', test: isPdf },
  'application/msword': { extensions: ['.doc'], canonicalMime: 'application/msword', test: isWordOle },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    extensions: ['.docx'],
    canonicalMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    test: isDocx,
  },
  'image/png': { extensions: ['.png'], canonicalMime: 'image/png', test: isPng },
  'image/jpeg': { extensions: ['.jpg', '.jpeg'], canonicalMime: 'image/jpeg', test: isJpeg },
};

/** Acceptance requires filename extension, declared multipart MIME and
 *  actual content to all agree. Returns the canonical MIME to persist in
 *  place of the browser-declared one; throws UploadRejectedError on any
 *  disagreement. A read/parse failure on the file's own bytes is treated as
 *  a content mismatch (not a 500) - except the handful of fs error codes
 *  that mean the staging file itself couldn't be read, which are
 *  infrastructure failures and must propagate as such. */
export async function validateFileContent(params: ValidateFileContentParams): Promise<string> {
  const validator = VALIDATORS[params.declaredMime];
  if (!validator) rejectMismatch();

  const extension = path.extname(params.originalName).toLowerCase();
  if (!validator.extensions.includes(extension)) rejectMismatch();

  let matches: boolean;
  try {
    matches = await validator.test(params.filePath);
  } catch (error) {
    if (isInfrastructureError(error)) throw error;
    matches = false;
  }
  if (!matches) rejectMismatch();

  return validator.canonicalMime;
}
