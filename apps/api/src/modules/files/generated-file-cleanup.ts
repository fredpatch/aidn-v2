/** STORAGE-3B/3C - shared by reports.service.ts and certificates.service.ts:
 *  a server-generated file is written to disk before its DB registration
 *  transaction runs (the row's id, needed for the stable /api/files/:id
 *  address, only exists after insert). If that transaction fails, the file
 *  must not be left behind with nothing pointing at it (closes
 *  REPORT-FILE-ROLLBACK, and the equivalent unlabeled gap for certificates).
 *  Best-effort only: never masks the original transaction error, and a
 *  failed cleanup is logged for manual attention rather than thrown. */
import fs from 'node:fs/promises';

export async function cleanupGeneratedFileOnFailure(absolutePath: string, context: string): Promise<void> {
  try {
    await fs.rm(absolutePath, { force: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[${context}] could not remove orphaned generated file "${absolutePath}": ${reason}`);
  }
}
