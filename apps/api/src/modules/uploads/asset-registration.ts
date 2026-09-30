/** STORAGE-0A - every stored file is an upload asset whose file_url is its
 *  own stable address (/api/files/<id>). The id only exists after insert, so
 *  the address is written in a second statement - callers pass a
 *  transaction when the two must commit together (a server-generated file's
 *  caller - reports.service.ts, certificates.service.ts - passes its own
 *  transaction so the asset commits atomically with its owning row and any
 *  version row, STORAGE-3B/3C). */
import { eq } from 'drizzle-orm';
import { fileAddress } from '@aidn/shared';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
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
