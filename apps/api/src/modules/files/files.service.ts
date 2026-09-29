/** STORAGE-0A - file delivery service. Every route goes through
 *  authorizeFile (the same decision for direct GET and grant issuance). */
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { uploadAssets } from '../../shared/db/schema.js';
import { UPLOADS_ROOT } from '../../shared/uploads-root.js';
import { canAccessFile, type FileActor } from './file-access.policy.js';
import { createDbFileContextStore, resolveAssetContext } from './file-context.js';
import { resolveStoragePath } from './file-delivery.js';

export type StoredAsset = typeof uploadAssets.$inferSelect;

export async function findAsset(id: number): Promise<StoredAsset | null> {
  const [asset] = await db.select().from(uploadAssets).where(eq(uploadAssets.id, id));
  return asset ?? null;
}

/** The asset when the actor may open it; null when it does not exist or is
 *  not accessible (callers answer both the same way). */
export async function authorizeFile(actor: FileActor, id: number): Promise<StoredAsset | null> {
  const asset = await findAsset(id);
  if (!asset) return null;
  const context = await resolveAssetContext(asset, createDbFileContextStore(db));
  return canAccessFile(actor, context) ? asset : null;
}

/** Absolute path and size of the asset's file, or null if it is missing
 *  on disk or its storage key is unsafe. */
export async function locateAssetFile(asset: StoredAsset): Promise<{ path: string; sizeBytes: number } | null> {
  const fullPath = resolveStoragePath(UPLOADS_ROOT, asset.storageKey);
  if (!fullPath) return null;
  try {
    const stats = await fs.promises.stat(fullPath);
    return stats.isFile() ? { path: fullPath, sizeBytes: stats.size } : null;
  } catch {
    return null;
  }
}
