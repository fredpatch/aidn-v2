/** STORAGE-0A - server-side "does this stored file exist?" for stored
 *  addresses: stable /api/files/<id> through the asset's storage key, and
 *  legacy /uploads/<key> until the address rewrite has run. */
import fs from 'node:fs';
import { inArray } from 'drizzle-orm';
import { parseFileAddress } from '@aidn/shared';
import { db } from '../../shared/db/index.js';
import { uploadAssets } from '../../shared/db/schema.js';
import { UPLOADS_ROOT } from '../../shared/uploads-root.js';
import { resolveStoragePath } from './file-delivery.js';

export function storageKeyForAddress(address: string | null, storageKeysById: Map<number, string>): string | null {
  if (!address) return null;
  const id = parseFileAddress(address);
  if (id !== null) return storageKeysById.get(id) ?? null;
  if (address.startsWith('/uploads/')) return address.slice('/uploads/'.length) || null;
  return null;
}

export function storedFileExistsIn(root: string, storageKey: string | null): boolean {
  if (!storageKey) return false;
  const fullPath = resolveStoragePath(root, storageKey);
  return fullPath !== null && fs.existsSync(fullPath);
}

/** Existence of each stored address, in order (one query for all assets). */
export async function storedFilesExist(addresses: Array<string | null>): Promise<boolean[]> {
  const ids = [...new Set(addresses.map((a) => parseFileAddress(a)).filter((id): id is number => id !== null))];
  const rows = ids.length
    ? await db.select({ id: uploadAssets.id, storageKey: uploadAssets.storageKey }).from(uploadAssets).where(inArray(uploadAssets.id, ids))
    : [];
  const keys = new Map(rows.map((row) => [row.id, row.storageKey]));
  return addresses.map((address) => storedFileExistsIn(UPLOADS_ROOT, storageKeyForAddress(address, keys)));
}

/** Absolute path of the file behind a stored address (stable or legacy),
 *  or null if it cannot be resolved inside the uploads root. */
export async function resolveStoredFilePath(address: string | null): Promise<string | null> {
  const id = parseFileAddress(address);
  const rows = id === null ? [] : await db.select({ storageKey: uploadAssets.storageKey }).from(uploadAssets).where(inArray(uploadAssets.id, [id]));
  const key = storageKeyForAddress(address, new Map(rows.map((row) => [id!, row.storageKey])));
  return key ? resolveStoragePath(UPLOADS_ROOT, key) : null;
}
