import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, copyFile } from 'node:fs/promises';
import type { DbTx } from '../../shared/db/index.js';
import { documentVersions } from '../../shared/db/schema.js';
import { insertAssetWithAddress } from '../uploads/asset-registration.js';
import { resolveStoredFilePath } from '../files/stored-file.js';
import { UPLOADS_ROOT } from '../../shared/uploads-root.js';
import type { PreparedAttachment } from '../uploads/upload-attachment.js';

/** SESSION1-M1-1 - copy-on-create. The DG-annotated return is what Assistante
 *  DN carries to the Directeur DN, but file access follows the single owner an
 *  asset is linked to (file-access.policy.ts): sharing the DG circuit's asset
 *  would force assistant_dn onto the DG circuit stage. So the Directeur DN
 *  circuit gets its own physical copy (same pattern as the M3 declaration
 *  circuit, decisions #14), distinct from the DG-annotated document.
 *
 *  Written to disk before the business transaction (the stable address only
 *  exists after insert), so a failure after this point must best-effort delete
 *  it (cleanupGeneratedFileOnFailure); the DG-annotated upload is never touched. */
export async function copyFileForDnCircuit(
  attachment: Pick<PreparedAttachment, 'fileUrl' | 'originalName'>
): Promise<{ storageKey: string; storagePath: string }> {
  const sourcePath = await resolveStoredFilePath(attachment.fileUrl);
  if (!sourcePath) throw new Error('UPLOAD_FILE_MISSING');

  const fileName = `${randomUUID()}${path.extname(attachment.originalName)}`;
  const storageKey = `generated/dn-annotation-circuit/${fileName}`;
  const storagePath = path.join(UPLOADS_ROOT, 'generated', 'dn-annotation-circuit', fileName);

  await mkdir(path.dirname(storagePath), { recursive: true });
  await copyFile(sourcePath, storagePath);
  return { storageKey, storagePath };
}

/** Registers the copy as a brand-new upload asset linked to the Directeur DN
 *  circuit created in the same transaction, and as its initial current version. */
export async function registerDnCircuitCopy(
  tx: DbTx,
  circuitId: number,
  attachment: Pick<PreparedAttachment, 'originalName' | 'mimeType' | 'sizeBytes'>,
  storageKey: string,
  uploadedBy: number
): Promise<void> {
  const { address } = await insertAssetWithAddress(tx, {
    storageKey,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    uploadedFromApp: 'api',
    moduleHint: 'dn-annotation',
    linkedOwnerType: 'dg_circuit_document',
    linkedOwnerId: circuitId,
    linkedAt: new Date(),
  });

  await tx.insert(documentVersions).values({
    ownerType: 'dg_circuit_document',
    ownerId: circuitId,
    fileUrl: address,
    mimeType: attachment.mimeType,
    uploadedBy,
    isCurrent: true,
  });
}
