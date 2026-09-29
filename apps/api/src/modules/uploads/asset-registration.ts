/** STORAGE-0A - every stored file is an upload asset whose file_url is its
 *  own stable address (/api/files/<id>). The id only exists after insert, so
 *  the address is written in a second statement - callers pass a
 *  transaction when the two must commit together. */
import { eq } from 'drizzle-orm';
import { fileAddress } from '@aidn/shared';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { db } from '../../shared/db/index.js';
import * as schema from '../../shared/db/schema.js';

export type AssetWriter = Pick<NodePgDatabase<typeof schema>, 'insert' | 'update'>;
export type NewAsset = Omit<typeof schema.uploadAssets.$inferInsert, 'id' | 'fileUrl'>;

export async function insertAssetWithAddress(
  executor: AssetWriter,
  values: NewAsset
): Promise<{ id: number; address: string }> {
  const [row] = await executor
    .insert(schema.uploadAssets)
    // Placeholder replaced right below with the stable address.
    .values({ ...values, fileUrl: '' })
    .returning({ id: schema.uploadAssets.id });
  const address = fileAddress(row.id);
  await executor.update(schema.uploadAssets).set({ fileUrl: address }).where(eq(schema.uploadAssets.id, row.id));
  return { id: row.id, address };
}

/** A file the API generated itself (certificate PDF, report), registered
 *  and linked in one transaction. */
export async function registerGeneratedFile(params: {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  moduleHint: string;
  ownerType: 'certificate_document' | 'report';
  ownerId: number;
  userId?: number | null;
}): Promise<{ id: number; address: string }> {
  return db.transaction((tx) =>
    insertAssetWithAddress(tx, {
      storageKey: params.storageKey,
      originalName: params.originalName,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      uploadedByUserId: params.userId ?? null,
      uploadedFromApp: 'api',
      moduleHint: params.moduleHint,
      linkedOwnerType: params.ownerType,
      linkedOwnerId: params.ownerId,
      linkedAt: new Date(),
    })
  );
}
